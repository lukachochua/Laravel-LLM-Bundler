# Laravel Code Bundler

A Visual Studio Code extension that bundles your Laravel project files into a single document for easy code review and sharing.

## Features

* Combines all relevant Laravel project files into a single text document
* Automatically excludes common non-essential directories and files
* Preserves file structure and organization through clear file headers
* Maintains original file content with proper formatting
* Simple one-click command activation

## Installation

1. Open Visual Studio Code
2. Press `Ctrl+P` (Windows/Linux) or `Cmd+P` (macOS)
3. Type `ext install laravel-bundler`
4. Press Enter

## Usage

### Command Palette
1. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Laravel: Bundle Project Files"
3. Press Enter

### Default Excluded Paths

The following paths are automatically excluded from bundling:

* Documentation files (`**/*.md`, `**/*.txt`)
* Configuration files (`.editorconfig`, `.env.example`, etc.)
* Build/compile files (`postcss.config.js`, `tailwind.config.js`, `vite.config.js`)
* Framework directories:
  * `bootstrap/cache/`
  * `config/`
  * `database/factories/`
  * `database/seeders/`
  * `node_modules/`
  * `public/`
  * `resources/css/`
  * `resources/js/`
  * `storage/`
  * `tests/`
* Common Laravel app directories:
  * `app/Http/Middleware/`
  * `app/Http/Requests/`
  * `app/Providers/`

## Requirements

* Visual Studio Code 1.60.0 or higher
* Active Laravel project workspace

## Extension Settings

This extension currently does not add any custom settings.

## Known Issues

* Large projects may take longer to bundle
* Memory usage may increase with project size

## Release Notes

### 1.0.0

* Initial release
* Basic bundling functionality
* Pre-configured exclusion paths

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

* Inspired by the Laravel community's need for easy code sharing
* Built for Laravel 11 and above