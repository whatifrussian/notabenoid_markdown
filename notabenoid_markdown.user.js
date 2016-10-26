// ==UserScript==
// @name notabenoid_markdown
// @description Markdown parser for notabenoid.org service
// @author Alexander Turenko <totktonada.ru@gmail.com>
// @license Public Domain
// @version 1.16
// @include http://notabenoid.com*
// @include /^http://notabenoid\.org/book/(41531|45955)/.+/
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
// 7. Metainfo fragment. Hold metainfo in last original fragment (if empty, remove that fragment).
//    Objection for original vs translation fragment: original hardly to accidental spoil.
//    Usage: for holding IDs of fragments with open discussion about it.

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
        loc = window.location.href.substring('http://notabenoid.org'.length);
        var BookType = Object.freeze({
            UNDEFINED: 0,
            WHAT_IF:   1,
            XKCD:      2,
            BOTH:      3
        });
        var book =
            (loc.indexOf('/book/41531/') == 0) ? BookType.WHAT_IF :
            (loc.indexOf('/book/45955/') == 0) ? BookType.XKCD :
            BookType.UNDEFINED;

        // via http://stackoverflow.com/a/7356528/1598057
        function isFunction(v) {
            var getType = {};
            return v && getType.toString.call(v) === '[object Function]';
        }

        // via http://stackoverflow.com/a/7772724/1598057
        function isString(s) {
            return typeof(s) === 'string' || s instanceof String;
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

        // Return template in the form {'value': smth, 'result_type': smth}.
        // Uncover all element declarations and flatten substitution.
        // Note: For any tags except <img> added close tag.
        function preprocess_tmpl(tag_type, default_type, items) {
            var res = [];
            items.forEach(function(item){
                // default_type if the type is omited
                var value_type = ('t' in item) ? item['t'] : default_type;

                var add_value = function(value){
                    if (isString(value) || isFunction(value)) {
                        res.push({value: value, result_type: value_type});
                    } else {
                        value.forEach(function(subitem){
                            // the parent type if the type is omited
                            subitem['t'] = ('t' in subitem) ? subitem['t'] : value_type;
                            preprocess_tmpl(tag_type, default_type, [subitem]).forEach(function(p_subitem){
                                res.push(p_subitem);
                            });
                        });
                    }
                };

                if ('e' in item) {
                    var open_tag = '<' + item['e'];
                    for (var f in item) {
                        if (f != 'v' && f != 'e' && f != 't')
                            open_tag += ' ' + f + '="' + item[f] + '"';
                    }
                    open_tag += '>';
                    res.push({value: open_tag, result_type: tag_type});
                    if ('v' in item)
                        add_value(item['v']);
                    if (item['e'] != 'img')
                        res.push({value: '</' + item['e'] + '>', result_type: tag_type});
                } else {
                    if ('v' in item)
                        add_value(item['v']);
                }
            });
            return res;
        };

        function preprocess_substitutions(tag_type, default_type, substitutions) {
            substitutions.forEach(function(s){
                s.tmpl = preprocess_tmpl(tag_type, default_type, s.tmpl);
            });
            return substitutions;
        }

        /* About (!:x) notation
         * ====================
         *
         * It is emulation for positive lookbehind (that have '(?<=x)' syntax)
         * due to JS don't support it. This implementation (see 'parse_by'
         * function) works for *one* occurence of '(!:x)' in *begin* of regexp
         * and correct only for regexps *without any flags* (it skip flags
         * because JS has no standard RegExp fields for acquire it).

         * I cannot use standard '(?<=x)' syntax because JS failed at new
         * RegExp creation (with 'invalid regexp group' message in Firefox). So
         * standard syntax isn't supported by JS and it forbid to hold such
         * expressions in RegExp objects for later emulation. Sad.

         * Negative lookbehind would be more appropriate in regexps that I use
         * below, but it hard to emulate fully correct (for example in case '^'
         * special symbol in the lookbehind expression). */

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

                // TODO: Make it looks like MyRegExp class
                // for make non-capturing group not affecting idx.
                // And give back standard positive lookbehind syntax.
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
            div_rendered = jQ('<div/>', {'class': 'text_rendered'});

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
                APOSTROPHE: "«Компьютерный» апостроф вместо специального символа (\\')",
                ABBR_SPACE: "Отсутствует пробел после сокращения (правильно: «т. е.», «и т. д.»)",
                SOLID_LONG_NUMBER: "Длинное число без разделителя разрядов (правильно: 123&amp;thinsp;000)",
                PERCENT_ENCODING: "Нечитаемый для человека URL (percent encoding для кирилицы)"
            });

            // Chunk types
            var CT = Object.freeze({
                // all substitutions applicable for plain text, except character names parsing
                PLAIN_TEXT:      1,
                // all substitutions, except s-s that has no sense for labels block
                LABELS_BLOCK:    2,
                // no substitutions except url parsing
                CAN_CONTAIN_URL: 3,
                // no substitutions except url checking (for percent encoding)
                TO_URL_CHECK:    4,
                // no substitutions
                OTHER:           5
            });

            var substitutions = preprocess_substitutions(CT.OTHER, CT.OTHER, [{
                // displayed formula
                re: /(!:^|[^\\])\${2}[^"]*(?:[^\\"])\${2}/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'formula_source'},
                    {v: '$0', e: 'span', 'class': 'formula_rendered', title: '$0'}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // inline formula
                re: /(!:^|[^\\])\$(?:[^"$]|\\\$)*(?:[^\\"])\$/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'inline_formula_source'},
                    {v: '$0', e: 'span', 'class': 'inline_formula_rendered', title: '$0'}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // footnote fragment
                re: /^(\[\^[0-9]{1,2}\]:)((?:.|\n|\r)*)$/,
                tmpl: [
                    {v: '$1', e: 'span', 'class': 'footnote_anchor'},
                    {t: CT.PLAIN_TEXT, v: function(matches){
                        div_rendered.addClass('footnote_body');
                        return matches[2];
                    }}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // quote with '>' (for example article question)
                re: /^(?:&gt;(?:.|\r|\n)*(?:<br>\r|<br>\n|<br>\r\n)?)+$/,
                tmpl: [
                    {t: CT.PLAIN_TEXT, v: function(matches){
                        p.parent().addClass('quote_block');
                        return matches[0];
                    }}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // [labels] text [/labels]
                re: /(\[labels\]<br>)((?:.|\n|\r)*)(\[\/labels\])/,
                tmpl: [
                    {v: '$1', e: 'span', 'class': 'labels_label'},
                    {v: '$2', e: 'div', 'class': 'labels_block', t: CT.LABELS_BLOCK},
                    {v: '$3', e: 'span', 'class': 'labels_label'}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // embed image: render: ![](url)
                re: /^render:\s+!\[\]\(([^\)]+)\)/m,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'rendered_md_src', t: CT.CAN_CONTAIN_URL},
                    {e: 'img', src: '$1'}
                ],
                for_book: BookType.BOTH,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // md image: ![](url "title")
                re: /!\[\]\((\S+)(\s+)"((?:[^"]|\\")*[^\\]|)"\)/,
                tmpl: [
                    {v: '![]'},
                    {e: 'span', 'class': 'md_image_url', v: [
                        {v: '('},
                        {v: '$1$2', t: CT.TO_URL_CHECK},
                        {e: 'span', 'class': 'md_image_title', v: [
                            {v: '"'},
                            {v: '$3', t: CT.PLAIN_TEXT},
                            {v: '"'}
                        ]},
                        {v: ')'}]
                    }
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // md image: ![](url)
                re: /!\[\]\((\S+)\)/,
                tmpl: [
                    {v: '![]'},
                    {e: 'span', 'class': 'md_image_url', v: [
                        {v: '('},
                        {v: '$1', t: CT.TO_URL_CHECK},
                        {v: ')'}]
                    }
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // md link: [text](url "title")
                re: /\[([^\]]*)\]\((\S+)(\s+)"((?:[^"]|\\")*[^\\]|)"\)/,
                tmpl: [
                    {e: 'span', 'class': 'md_link_url', v: [
                        {v: '['},
                        {v: '$1', e: 'a', href: '$2', 'class': 'md_link_text', t: CT.PLAIN_TEXT},
                        {v: ']('},
                        {v: '$2$3', t: CT.TO_URL_CHECK},
                        {e: 'span', 'class': 'md_link_title', v: [
                            {v: '"'},
                            {v: '$4', t: CT.PLAIN_TEXT},
                            {v: '"'}
                        ]},
                        {v: ')'}
                    ]}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // md link: [text](url)
                re: /\[([^\]]*)\]\((\S+)\)/,
                tmpl: [
                    {e: 'span', 'class': 'md_link_url', v: [
                        {v: '['},
                        {v: '$1', e: 'a', href: '$2', 'class': 'md_link_text', t: CT.PLAIN_TEXT},
                        {v: ']('},
                        {v: '$2', t: CT.TO_URL_CHECK},
                        {v: ')'}
                    ]}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // md reference link description: [1]: url "title text"
                re: /\[(\d{1,2})\]:(\s+)(\S+)(\s+)"((?:[^"]|\\")*[^\\]|)"/,
                tmpl: [
                    {v: '[$1]:$2'},
                    {v: '$3', e: 'a', href: '$3', 'class': 'md_link_url', t: CT.URL_TO_CHECK},
                    {v: '$4'},
                    {e: 'span', 'class': 'md_link_title', v: [
                        {v: '"'},
                        {v: '$5', t: CT.PLAIN_TEXT},
                        {v: '"'}
                    ]}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // mistake: 20 % → 20%
                re: /\d(?: |&amp;thinsp;|&amp;nbsp;)%/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.SPACE_PERCENT}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // special sequences: '&nbsp;' and '&thinsp;'
                re: /&amp;(nbsp|thinsp);/,
                tmpl: [
                    {v: '&amp;$1;', e: 'span', 'class': 'special_seq'}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // urls
                re: new RegExp(url_re),
                tmpl: [
                    {v: '$0', e: 'a', href: '$0', 'class': 'any_link_url', t: CT.TO_URL_CHECK}
                ],
                for_book: BookType.BOTH,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT, CT.CAN_CONTAIN_URL, CT.LABELS_BLOCK]
            }, {
                // mistake: 'text.[^1]' or 'text[^1]?'
                re: /[.,;:— ]\[\^[0-9]+\]|\[\^[0-9]+\][?!…]/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.FOOTNOTE_PUNCTUM}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // footnote reference
                re: /\[\^[0-9]{1,2}\]/,
                tmpl: [
                    {v: '$0', e: 'sup', 'class': 'footnote_ref'}
                ],
                for_book: BookType.WHAT_IF,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // mistake: ... → …
                re: /\.{3}/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.DOTS}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // mistake: {hyphen, en dash} → em dash
                re: /\S [-–] \S|^[-–] \S/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.NOT_EM_DASH}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // mistake: {hyphen, em dash} → en dash
                re: /\d[-—]\d/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.NOT_EN_DASH}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // mistake: computer style quotes
                re: /'[^']+'|"[^"]+"/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.QUOTES}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // mistake: computer style apostrophe
                re: /[^\s\\]'\S/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.APOSTROPHE}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // mistake: no space after abbreviation word
                re: new RegExp('[' + letters_re + ']\\.[' + letters_re + ']'),
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.ABBR_SPACE}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // **bold**
                re: /(!:^|[^\\])\*\*[^*]+\*\*/,
                tmpl: [
                    {v: '$0', e: 'strong'}
                ],
                for_book: BookType.BOTH,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // *italic*
                re: /(!:^|[^\\])\*[^*]+\*/,
                tmpl: [
                    {v: '$0', e: 'em'}
                ],
                for_book: BookType.BOTH,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // fragment with title text
                re: /^(Title(?: text|-текст):)((?:.|\r|\n)*)$/,
                tmpl: [
                    {v: '$1', e: 'span', 'class': 'char_name'},
                    {v: '$2', e: 'span', 'class': 'title_text', t: CT.PLAIN_TEXT}
                ],
                for_book: BookType.XKCD,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // transcript description: [Text text text.]
                re: /^\[.*\](?:<br>)?$/m,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'transcript_description'}
                ],
                for_book: BookType.XKCD,
                where: Where.BOTH,
                applicable_to: [CT.PLAIN_TEXT]
            }, {
                // characters names: one or two word, then colon
                re: /^\S+(?: \S+)?:(?=.)/m,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'char_name'}
                ],
                for_book: BookType.BOTH,
                where: Where.BOTH,
                applicable_to: (book == BookType.WHAT_IF) ?
                    [CT.LABELS_BLOCK] : [CT.PLAIN_TEXT]
            }, {
                // mistake: long number without &thinsp;
                re: /\d{5,}/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.SOLID_LONG_NUMBER}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.LABELS_BLOCK]
            }, {
                // mistake: cyrillic letters percent encoded in URL
                re: /(?:%D0%[9AB][0-9ABCDEF]|%D1%[8][0-9ABCDEF]|%D0%81|%D1%91)+/,
                tmpl: [
                    {v: '$0', e: 'span', 'class': 'mistake', title: Desc.PERCENT_ENCODING}
                ],
                for_book: BookType.BOTH,
                where: Where.TRAN,
                applicable_to: [CT.PLAIN_TEXT, CT.TO_URL_CHECK]
            }]);

            var chunks = [{
                type: CT.PLAIN_TEXT,
                value: p.html()
            }];

            var td_class = p.parent().parent().attr('class');
            substitutions.forEach(function(s){
                var ok = (s.for_book == BookType.BOTH) || (s.for_book == book);
                ok = ok && ((s.where == Where.BOTH) ||
                    (s.where == Where.ORIG && td_class == 'o') ||
                    (s.where == Where.TRAN && td_class == 't'));
                if (ok)
                    chunks = parse_by(chunks, s);
            });

            body = "";
            chunks.forEach(function(chunk){
                body += chunk.value;
            });

            // check for article title
            var is_announcement_tr = function(tr){
                var p = tr.children('td.o').find('p.text');
                return p.text() == 'Анонс';
            };
            var tr = p.parent().parent().parent()
            var on_article_title = (tr.index() == 0 && !is_announcement_tr(tr)) ||
                (tr.index() == 1 && is_announcement_tr(tr.prev()))
            if (on_article_title)
                div_rendered.addClass('article_title');

            div_rendered.html(body);
            p.after(div_rendered);

            // Process with MathJax if it already loaded.
            // If not, then it will processed when MathJax loaded.
            if (typeof MathJax != 'undefined') {
                div_rendered.children('.formula_rendered').each(function(){
                    MathJax.Hub.Queue(["Typeset", MathJax.Hub, $(this)[0]]);
                });
                div_rendered.children('.inline_formula_rendered').each(function(){
                    MathJax.Hub.Queue(["Typeset", MathJax.Hub, $(this)[0]]);
                });
            }
        }

        // via http://gabrieleromanato.name/jquery-detecting-new-elements-with-the-mutationobserver-object/
        // and https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
        function track_changes() {
            var observer_o = new MutationObserver(function(mutations){
                mutations.forEach(function(mutation){
                    if (mutation.addedNodes == null)
                        return;

                    jQ(mutation.addedNodes).each(function(){
                        if (jQTagName($(this)) == 'p' && $(this).hasClass('text')) {
                            var p = $(this);
                            p.parent().children('.text_rendered').remove();
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

        jQ('p.text').each(function(){
            var p = $(this);
            process(p);
        });

        track_changes();
    }

    var loc = w.location.href;

    if (loc.indexOf('http://notabenoid.com') == 0) {
        var new_loc = loc.replace(/^http:\/\/notabenoid.com/, 'http://notabenoid.org');
        window.location.replace(new_loc);
    } else if (loc.indexOf('http://notabenoid.org') == 0) {
        loc = loc.substring('http://notabenoid.org'.length);
        if (loc.indexOf('/book/41531/') != 0 && loc.indexOf('/book/45955/') != 0)
            return;

        // Enable MathJax everywhere except '.../ready' pages (for text copying).
        if (loc.indexOf('/book/41531/') == 0 && loc.indexOf('/ready') == -1)
            addMathJax();

        addGlobalStyle(
            // hide .text and make .text_rendered looks like
            'p.text { display: none; }\n' +
            '.text_rendered {\n' +
                'padding: 6px 8px 0px;\n' +
                'margin: 0px;\n' +
                'line-height: 130%;\n' +
                'word-wrap: break-word;\n' +
            '}\n' +
            'td.o .text_rendered {\n' +
                'margin-right: 110px;\n' +
            '}\n' +
            '.translator-oe-hide td.o .text_rendered {\n' +
                'margin-right: 14px;\n' +
            '}\n' +
            'td.t .text_rendered {\n' +
                'margin-right: 64px;\n' +
                'padding-right: 37px;\n' +
            '}\n' +
            // our styles below
            '#Tr td .text_rendered.footnote_body {\n' +
                'background-color: #faffee;\n' +
                'box-shadow: 0px 0px 1px 1px rgba(150, 200, 0, 0.7);\n' +
                '-moz-box-shadow: 0px 0px 1px 1px rgba(150, 200, 0, 0.7);\n' +
                '-webkit-box-shadow: 0px 0px 1px 1px rgba(150, 200, 0, 0.7);\n' +
                'margin: 10px;\n' +
                'padding: 4px;\n' +
            '}\n' +
            '#Tr td.o .text_rendered.footnote_body {\n' +
                'margin-right: 112px;\n' +
            '}\n' +
            '#Tr.translator-oe-hide td.o .text_rendered.footnote_body {\n' +
                'margin-right: 16px;\n' +
            '}\n' +
            '#Tr td.t .text_rendered.footnote_body {\n' +
                'margin-right: 66px;\n' +
                'padding-right: 29px;\n' +
            '}\n' +
            '.formula_source { color: #b8b8b8; }\n' +
            '.inline_formula_source { font-size: 0; }\n' +
            '.formula_rendered text, .inline_formula_rendered text {\n' +
                '-webkit-user-select: none;\n' +
                '-moz-user-select: none;\n' +
                'user-select: none;\n' +
            '}\n' +
            '.article_title {\n' +
                'font-weight: bold;\n' +
            '}\n' +
            '.quote_block {\n' +
                'background-color: #f0f8e6;\n' +
                'color: #53830d;\n' +
            '}\n' +
            '.labels_label   { color: #b8b8b8; }\n' +
            '.labels_block   {\n' +
                'margin: 0 0 0 20px;\n' +
                'line-indent: 1.5em\n' +
            '}\n' +
            '.transcript_description {\n' +
                'font-style: italic;\n' +
                'color: #b8b8b8;\n' +
            '}\n' +
            '.char_name {\n'+
                'font-style: italic;\n' +
                'color: #b8b8b8;\n' +
            '}\n' +
            '.title_text     { color: #7ab130; }\n' +
            '.md_image_url   { color: #b8b8b8; }\n' +
            '.md_image_title { color: #7ab130; }\n' +
            '.md_link_text   { color: #000000; }\n' +
            '.md_link_url    { color: #b8b8b8; }\n' +
            '.md_link_title  { color: #7ab130; }\n' +
            '.special_seq    { color: #b8b8b8; }\n' +
            '.any_link_url   { color: #b8b8b8; }\n' +
            '.rendered_md_src { display: none; }\n' +
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
