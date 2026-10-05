cmake_minimum_required(VERSION 3.14)
project(runner LANGUAGES CXX)

# Define the application target. To change its name, change BINARY_NAME in the
# top-level CMakeLists.txt, not the value here, or `flutter run` will no longer
# work.
#
# Any new source files that you add to the application should be added here.
add_executable(${BINARY_NAME} WIN32
  "flutter_window.cpp"
  "projector_window.cpp"
  "main.cpp"
  "utils.cpp"
  "win32_window.cpp"
  "${FLUTTER_MANAGED_DIR}/generated_plugin_registrant.cc"
  "Runner.rc"
  "runner.exe.manifest"
)

# Apply the standard set of build settings. This can be removed for applications
# that need different build settings.
apply_standard_settings(${BINARY_NAME})

# Add preprocessor definitions for the build version.
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION=\"${FLUTTER_VERSION}\"")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_MAJOR=${FLUTTER_VERSION_MAJOR}")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_MINOR=${FLUTTER_VERSION_MINOR}")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_PATCH=${FLUTTER_VERSION_PATCH}")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_BUILD=${FLUTTER_VERSION_BUILD}")

# Disable Windows macros that collide with C++ standard library functions.
target_compile_definitions(${BINARY_NAME} PRIVATE "NOMINMAX")

# The AI pen's handwriting reader (Windows.UI.Input.Inking through C++/WinRT; see
# handwriting_channel.h). A library of its own: C++/WinRT needs C++20 coroutine headers and
# exceptions, which the runner's standard settings (_HAS_EXCEPTIONS=0) leave out.
add_library(kinetix_handwriting STATIC "handwriting_channel.cpp")
target_compile_features(kinetix_handwriting PRIVATE cxx_std_20)
target_compile_options(kinetix_handwriting PRIVATE /W4 /EHsc /bigobj /permissive-)
target_compile_definitions(kinetix_handwriting PRIVATE "NOMINMAX" "WIN32_LEAN_AND_MEAN")
target_include_directories(kinetix_handwriting PRIVATE "${CMAKE_SOURCE_DIR}")
target_link_libraries(kinetix_handwriting PRIVATE flutter flutter_wrapper_app)
target_link_libraries(kinetix_handwriting PUBLIC "windowsapp.lib")

# Add dependency libraries and include directories. Add any application-specific
# dependencies here.
target_link_libraries(${BINARY_NAME} PRIVATE flutter flutter_wrapper_app)
target_link_libraries(${BINARY_NAME} PRIVATE kinetix_handwriting)
target_link_libraries(${BINARY_NAME} PRIVATE "dwmapi.lib")
target_include_directories(${BINARY_NAME} PRIVATE "${CMAKE_SOURCE_DIR}")

# Run the Flutter tool portions of the build. This must not be removed.
add_dependencies(${BINARY_NAME} flutter_assemble)
