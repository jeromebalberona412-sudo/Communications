<?php

namespace App\Modules\Communications\Services;

use App\Modules\Communications\Models\ChatAutomationFaq;

/**
 * Lightweight FAQ text matcher (no external AI).
 */
class FaqMatcherService
{
    private const STOP_WORDS = [
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as',
        'and', 'or', 'but', 'if', 'then', 'so', 'do', 'does', 'did', 'can',
        'could', 'would', 'should', 'will', 'i', 'me', 'my', 'we', 'our',
        'you', 'your', 'they', 'their', 'it', 'its', 'this', 'that', 'these',
        'those', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
        'please', 'po', 'ba', 'nga', 'lang', 'naman', 'ano', 'sa', 'ang', 'ng',
        'mga', 'ko', 'mo', 'ni', 'may', 'meron', 'yung', 'ung', 'pa',
    ];

    /**
     * @param  iterable<ChatAutomationFaq>  $faqs
     */
    public function findBestMatch(string $incoming, iterable $faqs, float $threshold = 0.55): mixed
    {
        $incomingNorm = $this->normalize($incoming);
        if ($incomingNorm === '' || mb_strlen($incomingNorm) < 3) {
            return null;
        }

        $incomingTokens = $this->meaningfulTokens($incomingNorm);
        if ($incomingTokens === []) {
            return null;
        }

        $best = null;
        $bestScore = 0.0;

        foreach ($faqs as $faq) {
            $questionNorm = $this->normalize((string) $faq->question);
            if ($questionNorm === '') {
                continue;
            }

            if ($incomingNorm === $questionNorm) {
                return $faq;
            }

            // Exact containment of the FAQ question (common when user clicks the chip).
            if (str_contains($incomingNorm, $questionNorm) || str_contains($questionNorm, $incomingNorm)) {
                $containScore = min(1.0, mb_strlen($incomingNorm) / max(1, mb_strlen($questionNorm)));
                if ($containScore >= 0.7) {
                    return $faq;
                }
            }

            $questionTokens = $this->meaningfulTokens($questionNorm);
            if ($questionTokens === []) {
                continue;
            }

            $overlap = count(array_intersect($incomingTokens, $questionTokens));
            $union = count(array_unique(array_merge($incomingTokens, $questionTokens)));
            $jaccard = $union > 0 ? $overlap / $union : 0.0;

            $coverage = $overlap / max(1, count($questionTokens));
            $score = max($jaccard, $coverage * 0.85);

            // Prefer stronger keyword overlap when both sides share at least 2 meaningful words.
            if ($overlap >= 2) {
                $score = max($score, $coverage);
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $faq;
            }
        }

        if ($best === null || $bestScore < $threshold) {
            return null;
        }

        return $best;
    }

    public function normalize(string $text): string
    {
        $text = mb_strtolower(trim($text));
        $text = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $text) ?? $text;
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;

        return trim($text);
    }

    /**
     * @return list<string>
     */
    public function meaningfulTokens(string $normalized): array
    {
        $parts = preg_split('/\s+/u', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $tokens = [];

        foreach ($parts as $part) {
            $word = (string) $part;
            if (mb_strlen($word) < 2) {
                continue;
            }
            if (in_array($word, self::STOP_WORDS, true)) {
                continue;
            }
            $tokens[] = $word;
        }

        return array_values(array_unique($tokens));
    }
}
