<?php

use Illuminate\Support\Facades\Route;

require app_path('Modules/Authentication/Routes/web.php');
require app_path('Modules/Dashboard/Routes/web.php');

Route::middleware(['auth', 'student'])->group(function () {
    require app_path('Modules/Messages/Routes/web.php');
});
