# bazel-kotlin-vscode-extension README
:bazel: :kotlin: :vscode:

This lightweight extension is used to "sync" the Bazel project with the Kotlin language server. 

## Features

- Sync the Bazel project with the Kotlin language server. Builds the code and makes the metadata about the code available to the language server.
- Refresh the Kotlin classpath. Required to trigger changes in the classpath when the code is built.

## Dependencies

Currently it relies on a few changes to the vscode-kotlin extension seen here https://github.com/fwcd/vscode-kotlin/compare/main...smocherla-brex:vscode-kotlin:main

This adds support for:
- Refresh the bazel classpath through the Kotlin extension API. 

Going forward, the functionality from the Kotlin extension will be moved into this extension as it's mostly a lightweight wrapper around the Kotlin LSP.

## TODO

- [ ] Move the Kotlin extension functionality into this extension.
- [ ] Add hover support to show docstrings.
- [ ] Complete Goto-Definition support for third-party libraries through source jars rather than decompiling the class jars.
- [ ] Single-test support to run tests.
- [ ] Some more performance improvements to the completions.
- [ ] Release pipeline and version the extension.

