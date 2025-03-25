# bazel-kotlin-vscode-extension README
[![Bazel][bazel-img]][bazel-url] [![Kotlin][kotlin-img]][kotlin-url] [![VSCode][vscode-img]][vscode-url]

[bazel-img]: https://img.shields.io/badge/build%20with-Bazel-43A047.svg
[bazel-url]: https://bazel.build
[kotlin-img]: https://img.shields.io/badge/kotlin-%237F52FF.svg?style=flat&logo=kotlin&logoColor=white
[kotlin-url]: https://kotlinlang.org
[vscode-img]: https://img.shields.io/badge/VSCode-0078D4?style=flat&logo=visual%20studio%20code&logoColor=white
[vscode-url]: https://code.visualstudio.com

This lightweight extension is used to "sync" the Bazel project with the Kotlin language server. This takes inspiration from the [Kotlin](https://github.com/fwcd/vscode-kotlin) but is focused on the [fork](https://github.com/smocherla-brex/kotlin-language-server-bazel-support) of the language server with bazel support.

## Features

- Automatically download the language server and keep it up to date.
- Partially sync Bazel packages on demand, build and notify the language server with updated bazel classpath.
- Completions
- Support for Goto-Definition for most usecases.
- Hover support to show docstrings in some cases.
- Ability to run single test for Kotest `DescribeSpec` suites.

## Usage

Right-click on a directory and select "Bazel KLS Sync". This will trigger a bazel build and activate the language server.

![image](./resources/usage.png)

## TODO

- [ ] Some more performance improvements to the completions.
- [ ] Improve performance with large files and especially with growing symbol index.


## Configuration options

- `bazelKLS.enabled`: Whether to enable the language server.
- `bazelKLS.languageServerVersion`: The version of the language server to use. Defaults to `v1.3.14-bazel` for now.
- `bazelKLS.jvmOpts`: The JVM options to use when starting the language server.
