<aside class="app-sidebar" id="app-sidebar" aria-label="Student navigation">
    <div class="sidebar-brand">Students</div>
    <nav class="sidebar-nav">
        <x-navigation-link :href="route('students.dashboard')" :active="request()->routeIs('students.dashboard')">
            Dashboard
        </x-navigation-link>
        <x-navigation-link :href="route('communications.index')" :active="request()->routeIs('communications.*')">
            Messages
        </x-navigation-link>
    </nav>
    <div class="sidebar-footer">
        <form method="POST" action="{{ route('students.logout') }}">
            @csrf
            <button type="submit" class="logout-button">Log out</button>
        </form>
    </div>
</aside>
