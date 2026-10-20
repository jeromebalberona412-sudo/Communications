<aside class="app-sidebar" id="app-sidebar" aria-label="Teacher navigation">
    <div class="sidebar-brand">Teachers</div>
    <nav class="sidebar-nav">
        <x-navigation-link :href="route('teachers.dashboard')" :active="request()->routeIs('teachers.dashboard')">
            Dashboard
        </x-navigation-link>
        <x-navigation-link :href="route('teachers.students.index')" :active="request()->routeIs('teachers.students.*')">
            Manage Students
        </x-navigation-link>
        <x-navigation-link :href="route('communications.index')" :active="request()->routeIs('communications.*')">
            Messages
        </x-navigation-link>
    </nav>
    <div class="sidebar-footer">
        <form method="POST" action="{{ route('teachers.logout') }}">
            @csrf
            <button type="submit" class="logout-button">Log out</button>
        </form>
    </div>
</aside>
