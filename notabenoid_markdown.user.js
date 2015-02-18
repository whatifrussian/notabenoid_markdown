// ==UserScript==
// @name notabenoid_markdown
// @description Markdown parser for notabenoid.org service
// @author Alexander Turenko <totktonada.ru@gmail.com>
// @license Public Domain
// @version 1.3
// @include http://notabenoid.org/book/41531/*
// ==/UserScript==

// ## TODO’s residence
// 1. Maybe get rid from jQuery; that used a little.
// 2. Maybe get data as 'p.text()' (not 'p.html()') and put it via 'text'.
//    But then we need to extra work with text chunks and new html objects.
//    That more clean way, but also more difficult.
// 3. Load MathJax only when it really needs. Add to MathJax queue only nodes,
//    which contains formulas.

// via http://habrahabr.ru/post/129343/ and http://pastebin.com/9CXXYYBX
// wrap the script in a closure (opera, ie)
(function(window, undefined) {
    // normalize window
    var w;
    if (typeof unsafeWindow != undefined) {
        w = unsafeWindow
    } else {
        w = window;
    }

    // do not run in frames
    if (w.self != w.top){
        return;
    }

    // via http://stackoverflow.com/a/3550261/1598057
    // a function that loads jQuery and calls a callback function when jQuery has finished loading
    // Note: jQ replaces $ to avoid conflicts.
    function addJQuery(callback) {
        var script = document.createElement("script");
        script.setAttribute("src", "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min.js");
        script.addEventListener('load', function() {
            var script = document.createElement("script");
            script.textContent = "window.jQ=jQuery.noConflict(true);(" + callback.toString() + ")();";
            document.body.appendChild(script);
        }, false);
        document.body.appendChild(script);
    }

    // via http://greasemonkey.win-start.de/patterns/add-css.html
    function addGlobalStyle(css) {
        var head, style;
        head = document.getElementsByTagName('head')[0];
        if (!head) { return; }
        style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        head.appendChild(style);
    }

    // via https://github.com/whatifrussian/website/blob/master/themes/whatif/templates/includes/mathjax.html
    // with added 'ignoreClass'
    function addMathJax() {
        var head = document.getElementsByTagName('head')[0];
        if (!head) { return; }

        var config = document.createElement("script");
        config.setAttribute("type", "text/x-mathjax-config");
        config.textContent =
            'MathJax.Hub.Config({\n' +
            '    extensions: ["tex2jax.js"],\n' +
            '    messageStyle: "none",\n' +
            '    jax: ["input/TeX", "output/SVG"],\n' +
            '    tex2jax: {\n' +
            '        inlineMath: [ [\'$\',\'$\'] ],\n' +
            '        displayMath: [ [\'$$\',\'$$\'] ],\n' +
            '        processEscapes: true,\n' +
            '        ignoreClass: [\'text\']\n' +
            '    },\n' +
            '    TeX: {\n' +
            '      extensions: ["AMSmath.js", "AMSsymbols.js"]\n' +
            '    },\n' +
            '    "SVG": { availableFonts: ["TeX"],  linebreaks: { automatic: true } }\n' +
            '});\n'
        head.appendChild(config);

        var script = document.createElement("script");
        script.setAttribute("type", "text/javascript");
        script.setAttribute("src", "//cdn.mathjax.org/mathjax/latest/MathJax.js");
        head.appendChild(script);
    }

    // This function will injected to page source.
    function main() {
        // via http://stackoverflow.com/a/7356528/1598057
        function isFunction(v) {
            var getType = {};
            return v && getType.toString.call(v) === '[object Function]';
        }

        // Replace '$0', '$1', '$2', ..., '$99' placeholders in string with some string values.
        // Note: Replaced all placeholders 'simultanously', so
        // str_format('$1 $2', [1: '$2', '$1']) must return '$2 $1'.
        function str_format(tmpl, values) {
            return tmpl.replace(/\$([0-9]{1,2})/g, function(_, num, _, _){
                return values[num];
            });
        }

        // Return tag name for jQuery node or null.
        function jQTagName(jQNode) {
            return 'tagName' in jQNode[0] ? jQNode[0].tagName.toLowerCase() : null;
        }

        // s -- substitution
        function parse_by(chunks, s) {
            var out = [];

            chunks.forEach(function(chunk){
                if (s.applicable_to.indexOf(chunk.type) < 0) {
                    out.push(chunk);
                    return;
                }

                var idx = 0;
                var start = 0;
                var end = 0;
                var matches;

                while ((matches = s.re.exec(chunk.value.substring(idx))) != null) {
                    start = idx + matches.index;
                    end = idx + matches.index + matches[0].length - 1;

                    // add text before matched chunks, if exists
                    if (start - idx > 0) {
                        var text_before = chunk.value.substring(idx, start);
                        out.push({type: chunk.type, value: text_before});
                    }

                    // add matched chunk
                    s.tmpl.forEach(function(t){
                        var str;
                        if (isFunction(t.value))
                            str = t.value(matches);
                        else
                            str = str_format(t.value, matches);
                        out.push({type: t.result_type, value: str});
                    });

                    idx = end + 1;
                }

                // add text after all matched chunks, if exists
                if (chunk.value.length - idx > 0) {
                    var text_after = chunk.value.substring(idx);
                    out.push({type: chunk.type, value: text_after});
                }
            });

            return out;
        }

        function process(p) {
            // via http://stackoverflow.com/a/3809435/1598057
            var letters_re = 'а-яА-Яa-zA-Z';
            var proto_re = '(?:https?:|ftp:)?\\/\\/';
            var domains_re = '[-' + letters_re + '0-9@:%._\\+~#=]{1,256}';
            var tld_re = '[' + letters_re + ']{2,6}';
            var page_re = '(?:[-' + letters_re + '0-9@:%._\\+~#=/?&;,]|\\([^)]*\\))*';
            var url_re = proto_re + domains_re + '\\.' + tld_re + '\\b' + page_re;

            var Where = Object.freeze({
                ORIG: 1,
                TRAN: 2,
                BOTH: 3
            });

            var Desc = Object.freeze({
                FOOTNOTE_PUNCTUM: "Положение знака сноски относительно знака препинания",
                DOTS: "Многоточие не одним знаком, а тремя точками",
                NOT_EM_DASH: "Дефис или среднее тире вместо длинного тире",
                NOT_EN_DASH: "Дефис или длинное тире вместо среднего тире (допустимо в формуле)",
                SPACE_PERCENT: "Пробельный символ перед знаком процента",
                QUOTES: "«Компьютерные» кавычки вместо русских «елочек» или английских «лапок»",
                APOSTROPHE: "«Компьютерный» апостроф вместо одиночной закрывающей кавычки-«лапки»",
                ABBR_SPACE: "Отсутствует пробел после сокращения (правильно: «т. е.», «и т. д.»)"
            });

            var ChunkType = Object.freeze({
                PLAIN_TEXT:      1,
                CAN_CONTAIN_URL: 2,
                OTHER:           3
            });

            substitutions = [{
                // formulas
                re: /(?:^|[^\\])\${1,2}.+(?:[^\\])\${1,2}/,
                tmpl: [{
                    value: '$0',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {

                // quote with '>' (for example article question)
                re: /^&gt;.*$/m,
                tmpl: [{
                    value: '<span class="quote_block">$0</span>',
                    result_type: ChunkType.CAN_CONTAIN_URL
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // [labels] and [/labels]
                re: /\[\/?labels\]/,
                tmpl: [{
                    value: '<span class="labels_block">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // md image: ![](url "title")
                re: /!\[\]\((\S+)(\s+)(".*")\)/,
                tmpl: [{
                    value: '![](<span class="md_image_url">$1</span>$2',
                    result_type: ChunkType.CAN_CONTAIN_URL
                }, {
                    value: '<span class="md_image_title">$3</span>)',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // md link: [text](url "title")
                re: /\[([^\]]*)\]\((\S+)(\s+)("[^"]*")\)/,
                tmpl: [{
                    value: '[$1](',
                    result_type: ChunkType.PLAIN_TEXT
                }, {
                    value: '$2',
                    result_type: ChunkType.CAN_CONTAIN_URL
                }, {
                    value: '$3<span class="md_link_title">$4</span>)',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // embed image: userscript: ![](url)
                re: /^userscript:\s+!\[\]\(([^\)]+)\)/m,
                tmpl: [{
                    value: '<span class="userscript_cmd">$0</span>',
                    result_type: ChunkType.CAN_CONTAIN_URL
                }, {
                    value: '<img src="$1"/>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: 20 % → 20%
                re: /\d(?: |&amp;thinsp;|&amp;nbsp;)%/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.SPACE_PERCENT + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // special sequences: '&nbsp;' and '&thinsp;'
                re: /&amp;(nbsp|thinsp);/,
                tmpl: [{
                    value: '<span class="special_seq">&amp;$1;</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // urls
                re: new RegExp(url_re),
                tmpl: [{
                    value: function(matches){
                        var url = matches[0].replace('&amp;', '&');
                        var url_d = matches[0];
                        return '<a href="' + url + '" class="any_link_url">' + url_d + '</a>';
                    },
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.CAN_CONTAIN_URL]
            }, {
                // mistake: 'text.[^1]' or 'text[^1]?'
                re: /[.,;:— ]\[\^[0-9]+\]|\[\^[0-9]+\][?!…]/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.FOOTNOTE_PUNCTUM + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: ... → …
                re: /\.{3}/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.DOTS + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: {hyphen, en dash} → em dash
                re: /\S [-–] \S|^[-–] \S/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.NOT_EM_DASH + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: {hyphen, em dash} → en dash
                re: /\d[-—]\d/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.NOT_EN_DASH + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: computer style quotes
                re: /'[^']'|"[^"]"/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.QUOTES + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: computer style apostrophe
                re: /'/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.APOSTROPHE + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: no space after abbreviation word
                re: new RegExp('[' + letters_re + ']\\.[' + letters_re + ']'),
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.ABBR_SPACE + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }];

            var chunks = [{
                type: ChunkType.PLAIN_TEXT,
                value: p.html()
            }];

            var td_class = p.parent().parent().attr('class');
            substitutions.forEach(function(s){
                var ok = (s.where == Where.BOTH) ||
                    (s.where == Where.ORIG && td_class == 'o') ||
                    (s.where == Where.TRAN && td_class == 't');
                if (ok)
                    chunks = parse_by(chunks, s);
            });

            body = "";
            chunks.forEach(function(chunk){
                body += chunk.value;
            });

            p_rendered = jQ('<p/>', {class: 'text_rendered', html: body});
            p.after(p_rendered);

            // Process with MathJax if it already loaded.
            // If not, then it will processed when MathJax loaded.
            if (typeof MathJax != 'undefined') {
                MathJax.Hub.Queue(["Typeset", MathJax.Hub, p_rendered[0]]);
            }
        }

        jQ('p.text').each(function(){
            var p = $(this);
            process(p);
        });

        // via http://gabrieleromanato.name/jquery-detecting-new-elements-with-the-mutationobserver-object/
        // and https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
        var observer_o = new MutationObserver(function(mutations){
            mutations.forEach(function(mutation){
                if (mutation.addedNodes == null)
                    return;

                jQ(mutation.addedNodes).each(function(){
                    if (jQTagName($(this)) == 'p' && $(this).hasClass('text')) {
                        var p = $(this);
                        p.parent().children('p.text_rendered').remove();
                        process(p);
                    }
                });
            });
        });

        var observer_t = new MutationObserver(function(mutations){
            mutations.forEach(function(mutation){
                if (mutation.addedNodes == null)
                    return;

                jQ(mutation.addedNodes).each(function(){
                    if (jQTagName($(this)) == 'div') {
                        $(this).children('p.text').each(function(){
                            var p = $(this);
                            process(p);
                        });
                    }
                });
            });
        });

        var observer_new = new MutationObserver(function(mutations){
            mutations.forEach(function(mutation){
                if (mutation.addedNodes == null)
                    return;

                jQ(mutation.addedNodes).each(function(){
                    var node = $(this);

                    if (jQTagName(node) == 'tr') {
                        // No guarantee that these nodes exists at this time,
                        // but it works for me...
                        var td_o_div = node.children('td.o').children('div');
                        var td_t = node.children('td.t');
                        observer_o.observe(td_o_div[0], {childList: true});
                        observer_t.observe(td_t[0], {childList: true});
                    }
                });
            });
        });

        // observe exists nodes
        jQ('td.o div').each(function(){
            observer_o.observe($(this)[0], {childList: true});
        });
        jQ('td.t').each(function(){
            observer_t.observe($(this)[0], {childList: true});
        });

        // register new nodes
        observer_new.observe(jQ('table#Tr > tbody')[0], {childList: true});
    }

    // Additional url check: Chrome do not treat @match as intended sometimes.
    if (/http:\/\/notabenoid.org\/book\/41531\//.test(w.location.href)) {
        addMathJax();
        addGlobalStyle(
            'p.text { display: none; }\n' +
            '.text_rendered {\n' +
                'padding: 6px 37px 0px 8px;\n' +
                'margin: 0px 64px 0px 0px;\n' +
                'line-height: 130%;\n' +
                'word-wrap: break-word;\n' +
            '}\n' +
            '.quote_block { color: #306030; }\n' +
            '.labels_block { color: #b8b8b8; }\n' +
            '.md_image_url { color: #b8b8b8; }\n' +
            '.md_image_title { color: #306030; }\n' +
            '.md_link_url { color: #b8b8b8; }\n' +
            '.md_link_title { color: #306030; }\n' +
            '.special_seq { color: #b8b8b8; }\n' +
            '.any_link_url { color: #b8b8b8; }\n' +
            '.userscript_cmd { display: none; }\n' +
            '.mistake { border-bottom: 1px dotted #ff0000; }\n'
        );
        addJQuery(main);
    }
})(window);
