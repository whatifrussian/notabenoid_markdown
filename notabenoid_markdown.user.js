// ==UserScript==
// @name notabenoid_markdown
// @description Markdown parser for notabenoid.org service
// @author Alexander Turenko <totktonada.ru@gmail.com>
// @license Public Domain
// @version 1.1
// @include http://notabenoid.org/book/41531/*
// ==/UserScript==

// via http://habrahabr.ru/post/129343/ and http://pastebin.com/9CXXYYBX
// wrap the script in a closure (opera, ie)
// do not spoil the global scope
// The script can be transformed into a bookmarklet easily :)
(function(window, undefined) {
    // normalized window
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
    // Note, jQ replaces $ to avoid conflicts.
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

    // the guts of this userscript
    function main() {
        function process(p) {
            var body = p.html();
            var re, tmpl;

            // [labels] and [/labels]
            re = /(\[\/?labels\])/g;
            tmpl = '<span class="labels_block">$1</span>';
            body = body.replace(re, tmpl);

            // md image
            re = /!\[\]\((\S+)(\s+)(".*")\)/g;
            tmpl = '![](<span class="md_image_url">$1</span>$2$3)';
            body = body.replace(re, tmpl);

            // md link
            re = /\[([^\]]*)\]\((\S+)(\s+)("[^"]*")\)/g;
            tmpl = '[$1]($2$3<span class="md_link_title">$4</span>)';
            body = body.replace(re, tmpl);

            // embed image
            re = /\n?\r?userscript:\s+!\[\]\(([^\)]+)\)/g;
            body = body.replace(re, function(matched, p1, offset, src){
                return '<span class="userscript_cmd">' + matched + '</span>' +
                    '<img src="' + p1.replace('http', '\0') + '"/>';
            });

            // special sequences
            re = /&amp;(nbsp|thinsp);/g;
            tmpl = '<span class="special_seq">&amp;$1;</span>';
            body = body.replace(re, tmpl);

            // via http://stackoverflow.com/a/3809435/1598057
            re = /(https?:\/\/(www\.)?[-а-яА-Яa-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-а-яА-Яa-zA-Z0-9@:%_\+.~#?&//=;]*))/g;
            tmpl = '<a href="$1" class="any_link_url">$1</a>';
            body = body.replace(re, tmpl);

            // embed image
            re = /\0/g;
            tmpl = 'http';
            body = body.replace(re, tmpl);

            // mistakes
            if (p.parent().parent().attr('class') == 't') {
                re = /(\.\[\^[0-9]+\]|\.\.\.|\S - \S)/g;
                tmpl = '<span class="mistake">$1</span>';
                body = body.replace(re, tmpl);
            }

            p.after(jQ('<p/>', {class: 'text_rendered', html: body}));
        }

        jQ('p.text').each(function(){
            var p = $(this);
            process(p);
        });

        // via http://gabrieleromanato.name/jquery-detecting-new-elements-with-the-mutationobserver-object/
        // and https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
        var observer_o = new MutationObserver(function(mutations){
            mutations.forEach(function(mutation){
                if (mutation.addedNodes != null) {
                    jQ(mutation.addedNodes).each(function(){
                        var tagName = 'tagName' in $(this)[0] ?
                                $(this)[0].tagName.toLowerCase() : null;
                        console.log(tagName + ' | ' + $(this).hasClass('text'));
                        if (tagName == 'p' && $(this).hasClass('text')) {
                            var p = $(this);
                            p.parent().children('p.text_rendered').remove();
                            process(p);
                        }
                    });
                }
            });
        });

        var observer_t = new MutationObserver(function(mutations){
            mutations.forEach(function(mutation){
                if (mutation.addedNodes != null) {
                    jQ(mutation.addedNodes).each(function(){
                        var tagName = 'tagName' in $(this)[0] ?
                                $(this)[0].tagName.toLowerCase() : null;
                        if (tagName == 'div') {
                            $(this).children('p.text').each(function(){
                                var p = $(this);
                                process(p);
                            });
                        }
                    });
                }
            });
        });

        jQ('td.o div').each(function(){
            observer_o.observe($(this)[0], {
                childList: true
            });
        });
        jQ('td.t').each(function(){
            observer_t.observe($(this)[0], {
                childList: true
            });
        });
    }

    // additional url check.
    // Google Chrome do not treat @match as intended sometimes.
    if (/http:\/\/notabenoid.org\/book\/41531\//.test(w.location.href)) {
        // Below is the userscript code itself
        addGlobalStyle(
            'p.text { display: none; }\n' +
            '.text_rendered {\n' +
                'padding: 6px 37px 0px 8px;\n' +
                'margin: 0px 64px 0px 0px;\n' +
                'line-height: 130%;\n' +
                'word-wrap: break-word;\n' +
            '}\n' +
            '.labels_block { color: #b8b8b8; }\n' +
            '.md_image_url { color: #b8b8b8; }\n' +
            '.md_link_url { color: #b8b8b8; }\n' +
            '.md_link_title { color: #50a850; }\n' +
            '.special_seq { color: #b8b8b8; }\n' +
            '.any_link_url { color: #b8b8b8; }\n' +
            '.userscript_cmd { display: none; }\n' +
            '.mistake { color: #ff0000; border: 1px solid #ff0000; }\n'
        );
        addJQuery(main);
    }
})(window);
