// ==UserScript==
// @name notabenoid_markdown
// @description Markdown parser for notabenoid.org service
// @author Alexander Turenko <totktonada.ru@gmail.com>
// @license Public Domain
// @version 1.4
// @include http://notabenoid.org/book/41531/*
// ==/UserScript==

// ## TODO’s residence
// 1. Maybe get rid from jQuery; that used a little.
// 2. Maybe get data as 'p.text()' (not 'p.html()') and put it via 'text'.
//    But then we need to extra work with text chunks and new html objects.
//    That more clean way, but also more difficult.
// 3. Load MathJax only when it really needs.
// 4. Hide '.[inline_]rendered_formula' before MathJax parse it.
// 5. Fuzzy translation fragments with button 'copy it to new my own fragment and edit'.
// 6. Adjust class names to similar on website.

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
            '        ignoreClass: "text|formula_source|inline_formula_source"\n' +
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
                var re = s.re;

                // TODO: make it looks like MyRegExp class
                // for make non-capturing group not affecting idx
                var start_non_capturing = (re.source.indexOf('(!:') == 0);
                if (start_non_capturing) {
                    var new_source = re.source.replace(/^\(!:/, '(');
                    re = new RegExp(new_source);
                }

                while ((matches = re.exec(chunk.value.substring(idx))) != null) {
                    if (start_non_capturing) {
                        matches.index += matches[1].length;
                        matches[0] = matches[0].substring(matches[1].length);
                        for (var i = 1; i < matches.length; ++i)
                            matches[i] = matches[i+1];
                        matches[matches.length-1] = null;
                    }

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
            p_rendered = jQ('<p/>', {class: 'text_rendered'});

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
                SPACE_PERCENT: "Пробел перед знаком процента",
                QUOTES: "«Компьютерные» кавычки вместо русских «елочек» или английских «лапок»",
                APOSTROPHE: "«Компьютерный» апостроф вместо одиночной закрывающей кавычки-«лапки»",
                ABBR_SPACE: "Отсутствует пробел после сокращения (правильно: «т. е.», «и т. д.»)"
            });

            var ChunkType = Object.freeze({
                PLAIN_TEXT:      1,
                LABELS_BLOCK:    2,
                CAN_CONTAIN_URL: 3,
                OTHER:           4
            });

            substitutions = [{
                // displayed formula
                re: /(!:^|[^\\])\${2}[^"]*(?:[^\\"])\${2}/,
                tmpl: [{
                    value: '<span class="formula_source">$0</span>' +
                        '<span class="formula_rendered" title="$0">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // inline formula
                re: /(!:^|[^\\])\$[^"]*(?:[^\\"])\$/,
                tmpl: [{
                    value: '<span class="inline_formula_source">$0</span>' +
                        '<span class="inline_formula_rendered" title="$0">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // footnote fragment
                re: /^(\[\^[0-9]{1,2}\]:)((?:.|\n|\r)*)$/,
                tmpl: [{
                    value: '<span class="footnote_anchor">$1</span>',
                    result_type: ChunkType.OTHER
                }, {
                    value: function(matches){
                        p_rendered.addClass('footnote_body');
                        return matches[2];
                    },
                    result_type: ChunkType.PLAIN_TEXT
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
                // [labels] text [/labels]
                re: /(\[labels\]<br>)((?:.|\n|\r)*)(\[\/labels\])/,
                tmpl: [{
                    value: '<span class="labels_label">$1</span>',
                    result_type: ChunkType.OTHER
                }, {
                    value: '<div class="labels_block">$2</div>',
                    result_type: ChunkType.LABELS_BLOCK
                }, {
                    value: '<span class="labels_label">$3</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // embed image: render: ![](url)
                re: /^render:\s+!\[\]\(([^\)]+)\)/m,
                tmpl: [{
                    value: '<span class="rendered_md_src">$0</span>',
                    result_type: ChunkType.CAN_CONTAIN_URL
                }, {
                    value: '<img src="$1"/>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // md image: ![](url "title")
                re: /!\[\]\((\S+)(\s+)(".*")\)/,
                tmpl: [{
                    value: '![]<span class="md_image_url">($1$2' +
                        '<span class="md_image_title">$3</span>)</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // md link: [text](url "title")
                re: /\[([^\]]*)\]\((\S+)(\s+)("[^"]*")\)/,
                tmpl: [{
                    value: '[<a href="$2" class="md_link_text">',
                    result_type: ChunkType.OTHER
                }, {
                    value: '$1',
                    result_type: ChunkType.PLAIN_TEXT
                }, {
                    value: '</a>]<span class="md_link_url">($2$3' +
                        '<span class="md_link_title">$4</span>)</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // md link: [text](url)
                re: /\[([^\]]*)\]\((\S+)\)/,
                tmpl: [{
                    value: '[<a href="$2" class="md_link_text">',
                    result_type: ChunkType.OTHER
                }, {
                    value: '$1',
                    result_type: ChunkType.PLAIN_TEXT
                }, {
                    value: '</a>]<span class="md_link_url">($2)</span>',
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
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // special sequences: '&nbsp;' and '&thinsp;'
                re: /&amp;(nbsp|thinsp);/,
                tmpl: [{
                    value: '<span class="special_seq">&amp;$1;</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // urls
                re: new RegExp(url_re),
                tmpl: [{
                    value: '<a href="$0" class="any_link_url">$0</a>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.CAN_CONTAIN_UR, ChunkType.LABELS_BLOCKL]
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
                // footnote reference
                re: /\[\^[0-9]{1,2}\]/,
                tmpl: [{
                    value: '<sup class="footnote_ref">$0</sup>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT]
            }, {
                // mistake: ... → …
                re: /\.{3}/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.DOTS + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // mistake: {hyphen, en dash} → em dash
                re: /\S [-–] \S|^[-–] \S/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.NOT_EM_DASH + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // mistake: {hyphen, em dash} → en dash
                re: /\d[-—]\d/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.NOT_EN_DASH + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // mistake: computer style quotes
                re: /'[^']'|"[^"]"/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.QUOTES + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // mistake: computer style apostrophe
                re: /'/,
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.APOSTROPHE + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // mistake: no space after abbreviation word
                re: new RegExp('[' + letters_re + ']\\.[' + letters_re + ']'),
                tmpl: [{
                    value: '<span class="mistake" title="' + Desc.ABBR_SPACE + '">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.TRAN,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // **bold**
                re: /(!:^|[^\\])\*\*[^*]+\*\*/,
                tmpl: [{
                    value: '<strong>$0</strong>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // *italic*
                re: /(!:^|[^\\])\*[^*]+\*/,
                tmpl: [{
                    value: '<em>$0</em>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.PLAIN_TEXT, ChunkType.LABELS_BLOCK]
            }, {
                // characters names
                re: /^\S+:/m,
                tmpl: [{
                    value: '<span class="char_name">$0</span>',
                    result_type: ChunkType.OTHER
                }],
                where: Where.BOTH,
                applicable_to: [ChunkType.LABELS_BLOCK]
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

            p_rendered.html(body);
            p.after(p_rendered);

            // Process with MathJax if it already loaded.
            // If not, then it will processed when MathJax loaded.
            if (typeof MathJax != 'undefined') {
                p_rendered.children('.formula_rendered').each(function(){
                    MathJax.Hub.Queue(["Typeset", MathJax.Hub, $(this)[0]]);
                });
                p_rendered.children('.inline_formula_rendered').each(function(){
                    MathJax.Hub.Queue(["Typeset", MathJax.Hub, $(this)[0]]);
                });
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
            '.formula_source { color: #b8b8b8; }\n' +
            '.inline_formula_source { font-size: 0; }\n' +
            '.formula_rendered text, inline_formula_rendered text {\n' +
                '-webkit-user-select: none;\n' +
                '-moz-user-select: none;\n' +
                'user-select: none;\n' +
            '}\n' +
            '#Tr tr:first-child .text_rendered {\n' +
                'font-weight: bold;\n' +
            '}\n' +
            '.quote_block    { color: #53830d; }\n' +
            '.labels_label   { color: #b8b8b8; }\n' +
            '.labels_block   {\n' +
                'margin: 0 0 0 20px;\n' +
                'line-indent: 1.5em\n' +
            '}\n' +
            '.char_name      {\n'+
                'font-style: italic;\n' +
                'font-weight: bold;\n' +
                'color: #b8b8b8;\n' +
            '}\n' +
            '.md_image_url   { color: #b8b8b8; }\n' +
            '.md_image_title { color: #306030; }\n' +
            '.md_link_text   { color: #7ab130; }\n' +
            '.md_link_url    { color: #b8b8b8; }\n' +
            '.md_link_title  { color: #306030; }\n' +
            '.special_seq    { color: #b8b8b8; }\n' +
            '.any_link_url   { color: #b8b8b8; }\n' +
            '.rendered_md_src { display: none; }\n' +
            '.text_rendered.footnote_body {\n' +
                'background-color: #faffee;\n' +
                'box-shadow: 0px 0px 1px 1px rgba(150, 200, 0, 0.7);\n' +
                '-moz-box-shadow: 0px 0px 1px 1px rgba(150, 200, 0, 0.7);\n' +
                '-webkit-box-shadow: 0px 0px 1px 1px rgba(150, 200, 0, 0.7);\n' +
                'margin: 10px 71px 10px 10px;\n' +
                'padding: 4px 24px 4px 4px;\n' +
            '}\n' +
            '.footnote_anchor { color: #53830d; }\n' +
            '.footnote_ref {\n' +
                'color: #53830d;\n' +
            '}\n' +
            '.mistake {\n' +
                'border-bottom: 2px dotted red;\n' +
                'background-color: #fee;\n' +
            '}\n'
        );
        addJQuery(main);
    }
})(window);
