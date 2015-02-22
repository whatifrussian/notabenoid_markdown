## About

This is userscript for support the process of translating [What If?](http://what-if.xkcd.com) articles and [xkcd](http://xkcd.com) webcomic to Russian. It parse and style text fragments on Notabenoid (the service for collective text tranlating) for convenient reading and editing.

## Installation

1. Install the [Scriptish](https://addons.mozilla.org/ru/firefox/addon/scriptish/) addon for Firefox or [TamperMonkey](http://tampermonkey.net/#download) addon for Chrome/Chromium.
2. Install [this userscript](https://github.com/whatifrussian/notabenoid_markdown/raw/master/notabenoid_markdown.user.js).

For Chrome/Chromium you can skip first step, download script and install it from local file. But then you lose ability to easy updating the script.

## Syntax

The script highlight subset of markdown formatting elements, render links and formulas; nothing unexpected here. Typical mistakes (for Russian texts) also highlighted in translated text as well as few formatting peculiarity, which is specific for our projects (for example scene descriptions and character names).

Also the script provide directive `render`, which now support only image embedding with the next syntax:

```
render: ![](http://example.com/image.png)
```

Note: For detailed list of all performed substitutions please check out `substitutions` variable in source code.

The script perform redirect from old URLs with `.com` top level domain to the similar URLs with `.org`.

## License

Public domain. You free to use it as you need without any restrictions. No guarantees provided.
