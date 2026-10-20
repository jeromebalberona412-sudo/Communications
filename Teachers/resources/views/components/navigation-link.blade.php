@props(['href', 'active' => false])

<a href="{{ $href }}" @class(['app-nav-link', 'active' => $active]) @if($active) aria-current="page" @endif>
    {{ $slot }}
</a>
