@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo ============================================
echo  Trident APK Builder
echo ============================================
echo.

echo [1/3] Installing npm dependencies...
call npm install
if errorlevel 1 (
    echo.
    echo npm install failed. Fix the error above and try again.
    pause
    exit /b 1
)

echo.
echo [2/3] Syncing Capacitor Android project...
call npx cap sync android
if errorlevel 1 (
    echo.
    echo cap sync failed. Fix the error above and try again.
    pause
    exit /b 1
)

echo.
echo [3/3] Building debug APK...

REM gradlew needs a JDK, and a plain command prompt usually doesn't have one on
REM its PATH even though Android Studio works fine (it bundles its own). Point
REM JAVA_HOME at that bundled JDK automatically if nothing else is set.
if "%JAVA_HOME%"=="" (
    if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
        set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
        echo Using Android Studio's bundled JDK: !JAVA_HOME!
    ) else if exist "%LocalAppData%\Programs\Android Studio\jbr\bin\java.exe" (
        set "JAVA_HOME=%LocalAppData%\Programs\Android Studio\jbr"
        echo Using Android Studio's bundled JDK: !JAVA_HOME!
    ) else (
        echo.
        echo Could not auto-detect a JDK. If the build below fails with a
        echo JAVA_HOME error, find Android Studio's "jbr" folder yourself
        echo ^(Settings, search "JDK Location"^) and set JAVA_HOME to it.
        echo.
    )
)

cd android

REM Gradle also needs to know where the Android SDK lives, via
REM local.properties. Android Studio normally writes this itself the first
REM time it opens a project, but it's a machine-specific file (correctly
REM left out of the zip), so a fresh copy of this project won't have it yet.
if not exist "local.properties" (
    if exist "%LocalAppData%\Android\Sdk" (
        set "SDK_PATH=%LocalAppData%\Android\Sdk"
    ) else if exist "%ProgramFiles%\Android\Sdk" (
        set "SDK_PATH=%ProgramFiles%\Android\Sdk"
    )
    if defined SDK_PATH (
        set "SDK_PATH_FORWARD=!SDK_PATH:\=/!"
        echo sdk.dir=!SDK_PATH_FORWARD! > local.properties
        echo Wrote local.properties pointing at: !SDK_PATH!
    ) else (
        echo.
        echo Could not auto-detect the Android SDK location. Open this
        echo project in Android Studio once ^(it will create local.properties
        echo for you^), or find the SDK path yourself ^(Settings, search
        echo "Android SDK Location"^) and create android\local.properties
        echo with a line like: sdk.dir=C:/Users/YourName/AppData/Local/Android/Sdk
        echo.
    )
)

call gradlew.bat assembleDebug
if errorlevel 1 (
    echo.
    echo Gradle build failed. Fix the error above and try again.
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ============================================
echo  Build succeeded!
echo  APK: android\app\build\outputs\apk\debug\app-debug.apk
echo ============================================
echo.

REM Open the output folder so the APK is right there
start "" "android\app\build\outputs\apk\debug"

pause
