<?php

namespace App\Services;

/**
 * Stub for the Communications package. Students/Teachers have no barangay logos.
 */
class BarangayLogoUrlService
{
    public function resolve(int $barangayId): ?string
    {
        return null;
    }

    /**
     * @param  list<int>  $barangayIds
     * @return array<int, string|null>
     */
    public function resolveMany(array $barangayIds): array
    {
        $out = [];
        foreach ($barangayIds as $id) {
            $out[(int) $id] = null;
        }

        return $out;
    }
}
