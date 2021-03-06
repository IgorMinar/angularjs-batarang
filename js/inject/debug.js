var inject = function () {
  document.head.appendChild((function () {
    var fn = function bootstrap (window) {

      var ngLoaded = function () {
        if (!window.angular) {
          return false;
        }
        try {
          window.angular.module('ng');
        }
        catch (e) {
          return false;
        }
        return true;
      };

      // TODO: remove needless recursion
      if (!ngLoaded()) {
        (function () {
          // TODO: var name
          var areWeThereYet = function (ev) {
            if (ev.srcElement.tagName === 'SCRIPT') {
              var oldOnload = ev.srcElement.onload;
              ev.srcElement.onload = function () {
                if (ngLoaded()) {

                  document.removeEventListener('DOMNodeInserted', areWeThereYet);
                  bootstrap(window);
                }
                if (oldOnload) {
                  oldOnload.apply(this, arguments);
                }
              };
            }
          };
          document.addEventListener('DOMNodeInserted', areWeThereYet);
        }());
        return;
      }

      // do not patch twice
      if (window.__ngDebug) {
        return;
      }
      //var bootstrap = window.angular.bootstrap;
      var debug = window.__ngDebug = {
        watchers: {},
        timeline: [],
        watchExp: {},
        watchList: {},
        deps: []
      };
      /*
      var injector = angular.injector;
      angular.injector = function () {
        console.log(arguments);
        var ret = injector.apply(this, arguments);

        
        return ret;
      };
      */

      var annotate = angular.injector().annotate;

      // not all versions of AngularJS expose annotate
      if (!annotate) {
        annotate = (function () {

          var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
          var FN_ARG_SPLIT = /,/;
          var FN_ARG = /^\s*(_?)(.+?)\1\s*$/;
          var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

          // TODO: should I keep these assertions?
          function assertArg(arg, name, reason) {
            if (!arg) {
              throw new Error("Argument '" + (name || '?') + "' is " + (reason || "required"));
            }
            return arg;
          }
          function assertArgFn(arg, name, acceptArrayAnnotation) {
            if (acceptArrayAnnotation && angular.isArray(arg)) {
                arg = arg[arg.length - 1];
            }

            assertArg(angular.isFunction(arg), name, 'not a function, got ' +
                (arg && typeof arg == 'object' ? arg.constructor.name || 'Object' : typeof arg));
            return arg;
          }

          return function (fn) {
            var $inject,
                fnText,
                argDecl,
                last;

            if (typeof fn == 'function') {
              if (!($inject = fn.$inject)) {
                $inject = [];
                fnText = fn.toString().replace(STRIP_COMMENTS, '');
                argDecl = fnText.match(FN_ARGS);
                argDecl[1].split(FN_ARG_SPLIT).forEach(function(arg) {
                  arg.replace(FN_ARG, function(all, underscore, name) {
                    $inject.push(name);
                  });
                });
                fn.$inject = $inject;
              }
            } else if (angular.isArray(fn)) {
              last = fn.length - 1;
              assertArgFn(fn[last], 'fn')
              $inject = fn.slice(0, last);
            } else {
              assertArgFn(fn, 'fn', true);
            }
            return $inject;
          };
        }());
      }

      var module = angular.module;
      angular.module = function (moduleName) {
        //console.log(arguments);
        var mod = module.apply(this, arguments);

        var methods = [
          'constant',
          'controller',
          'directive',
          'factory',
          'filter',
          'provider',
          'service',
          'value'
        ];
        methods.forEach(function (met) {
          var temp = mod[met];
          mod[met] = function (thingName, definition) {
            var def;
            if (typeof definition === 'function') {
              def = annotate(definition);
            } else {
              def = definition.slice(0);
              def.pop();
            }
            debug.deps.push({
              name: thingName,
              type: met,
              size: def.length,
              imports: def
            });
            /*
            console.log(
              'module: ' + moduleName,
              'type: ' + met,
              thingName,
              'requires: ' + def);
            */

            return temp.apply(this, arguments);
          }
        });

        //console.log(mod);
        return mod;
      };

      /*
      angular.providerHook(function (name, path, fn) {
        var curDep = debug.deps;

        var i;
        for (i = path.length - 1; i >= 0; i -= 1) {
          if (!curDep[path[i]]) {
            curDep[path[i]] = {};
          }
          curDep = curDep[path[i]];
        }

        if ((path.length === 0 || path[0] !== name) && !curDep[name]) {
          curDep[name] = {};
        }
        
        return fn();
      });
*/

      var ng = angular.module('ng');
      ng.config(function ($provide) {

        $provide.decorator('$rootScope', function ($delegate) {
          
          var watchFnToHumanReadableString = function (fn) {
            if (fn.exp) {
              return fn.exp.trim();
            } else if (fn.name) {
              return fn.name.trim();
            } else {
              return fn.toString();
            }
          };

          // patch registering watchers
          // --------------------------
          var watch = $delegate.__proto__.$watch;
          $delegate.__proto__.$watch = function() {
            if (!debug.watchers[this.$id]) {
              debug.watchers[this.$id] = [];
            }
            var str = watchFnToHumanReadableString(arguments[0]);

            debug.watchers[this.$id].push(str);
            
            
            var w = arguments[0];
            if (typeof w === 'function') {
              arguments[0] = function () {
                var start = window.performance.webkitNow();
                var ret = w.apply(this, arguments);
                var end = window.performance.webkitNow();
                if (!debug.watchExp[str]) {
                  debug.watchExp[str] = {
                    time: 0,
                    calls: 0
                  };
                }
                debug.watchExp[str].time += (end - start);
                debug.watchExp[str].calls += 1;
                return ret;
              };
            } else {
              var thatScope = this;
              arguments[0] = function () {
                var start = window.performance.webkitNow();
                var ret = thatScope.$eval(w);
                var end = window.performance.webkitNow();
                if (!debug.watchExp[str]) {
                  debug.watchExp[str] = {
                    time: 0,
                    calls: 0
                  };
                }
                debug.watchExp[str].time += (end - start);
                debug.watchExp[str].calls += 1;
                return ret;
              };
            }

            var fn = arguments[1];
            arguments[1] = function () {
              var start = window.performance.webkitNow();
              var ret = fn.apply(this, arguments);
              var end = window.performance.webkitNow();
              var str = fn.toString();
              if (typeof debug.watchList[str] !== 'number') {
                debug.watchList[str] = 0;
                //debug.watchList[str].total = 0;
              }
              debug.watchList[str] += (end - start);
              //debug.watchList[str].total += (end - start);
              //debug.dirty = true;
              return ret;
            };

            return watch.apply(this, arguments);
          };

          // patch destroy
          // -------------

          /*
          var destroy = $delegate.__proto__.$destroy;
          $delegate.__proto__.$destroy = function () {
            if (debug.watchers[this.$id]) {
              delete debug.watchers[this.$id];
            }
            debug.dirty = true;
            return destroy.apply(this, arguments);
          };
          */
          
          // patch apply
          // -----------
          var firstLog = 0;
          var apply = $delegate.__proto__.$apply;
          $delegate.__proto__.$apply = function (fn) {
            var start = window.performance.webkitNow();
            var ret = apply.apply(this, arguments);
            var end = window.performance.webkitNow();
            if (Math.round(end - start) === 0) {
              if (debug.timeline.length === 0) {
                firstLog = start;
              }
              debug.timeline.push({
                start: Math.round(start - firstLog),
                end: Math.round(end - firstLog)
              });
            }
            //debug.dirty = true;

            if (debug.log) {
              if (fn) {
                if (fn.name) {
                  fn = fn.name;
                } else if (fn.toString().split('\n').length > 1) {
                  fn = 'fn () { ' + fn.toString().split('\n')[1].trim() + ' /* ... */ }';
                } else {
                  fn = fn.toString().trim().substr(0, 30) + '...';
                }
              } else {
                fn = '$apply';
              }
              console.log(fn + '\t\t' + (end - start).toPrecision(4) + 'ms');
            }

            return ret;
          };

          return $delegate;
        });
      });
    };

    var script = window.document.createElement('script');
    script.innerHTML = '(' + fn.toString() + '(window))';
    
    return script;
  }()));
};

// only inject if cookie is set
if (document.cookie.indexOf('__ngDebug=true') != -1) {
  document.addEventListener('DOMContentLoaded', inject);
/*
  (function () {


    var hackBootstrap = function () {
      var bootstrap = angular.bootstrap;
      window.angular.bootstrap = function () {
        inject();
        bootstrap.apply(this, arguments);
      };
    };

    // else, patch angular.bootstrap
    if (window.angular) {
      hackBootstrap();
    } else {
      // TODO: the AngularJS script it being asynchronously loaded and manually bootstrapped.
      // Not sure what I can do here

      // current strategy: run at DOMContentLoaded and hope for the best
      document.addEventListener('DOMContentLoaded', function () {
        var areWeThereYet = function (ev) {
          if (ev.srcElement.tagName === 'SCRIPT') {
            var oldOnload = ev.srcElement.onload;
            ev.srcElement.onload = function () {
              if (window.angular) {
                document.removeEventListener('DOMNodeInserted', areWeThereYet);
                hackBootstrap();
              }
              if (oldOnload) {
                oldOnload.apply(this, arguments);
              }
            };
          }
        }
        document.addEventListener('DOMNodeInserted', areWeThereYet);
      });
    }

  }());
*/
}
