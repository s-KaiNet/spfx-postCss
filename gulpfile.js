'use strict';

const fs = require('fs');
const watch = require('gulp-watch');
const gulp = require('gulp');
const cache = require('gulp-cached');
const build = require('@microsoft/sp-build-web');
const msThemedStyleLoader = require.resolve('@microsoft/loader-load-themed-styles');
const resolve = require("path").resolve;

build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);

RegExp.prototype.toJSON = RegExp.prototype.toString;

//disable sass task, we rely solely on webpack and postCss
build.sass.enabled = false;

let customWatchRegistered = false;


// TODO: Main issues:
// 1. sync file from lib back to src
// 2. Too complicated config?

let styleDefinitionWatch = build.subTask('style-definition-watch', (gulp, buildOptions, done) => {

  // register watch only on first run and only on serve
  if (!customWatchRegistered && build.rig.getYargs().argv._.indexOf('serve') !== -1) {

    watch('lib/**/*.scss.d.ts', event => {
      gulp.src(event.path, { base: 'lib' })
        .pipe(cache('scss'))  // cache required in order to prevent infinite refresh, with cache the file gets copied only in case if it was changed
        .pipe(gulp.dest('src'));
    });

    // after watch is registered don't register again
    customWatchRegistered = true;

  }
  // tell build.rig the work is done.
  done();

});

// to make sure 'lib' folder is created we added in post build
build.rig.addPostBuildTask(styleDefinitionWatch);


//add postCss loader for .scss files

const postCssLoader = {
  loader: "postcss-loader",
  options: {
    plugins: () => [
      // inline @import rules content
      require("postcss-import")(), // https://github.com/postcss/postcss-import

      // sass syntax + staged CSS features
      require("precss")(), // https://github.com/jonathantneal/precss

      // https://github.com/ai/browserslist
      require("autoprefixer")({
        browsers: ["last 2 versions", "ie >= 11"]
      })
    ]
  }
};

build.configureWebpack.mergeConfig({
  additionalConfiguration: (baseConfig) => {

    let cssRuleIndex = -1;
    baseConfig.module.rules.forEach((rule, index) => {
      if (rule.test && rule.test.toString().indexOf('.css$') !== -1) cssRuleIndex = index;
    });

    if (cssRuleIndex === -1) throw new Error('Unable to find css rule.');

    // remove css rule from webpack, we're going to use our own postCss rule for .scss files
    baseConfig.module.rules.splice(cssRuleIndex, 1)

    baseConfig.module.rules.push({
      test: /\.module\.scss$/i,      // generates css modules with type definitions for files with .module.scss ending
      use: [
        {
          loader: msThemedStyleLoader,   // support for themes
          options: {
            async: true
          }
        },
        {
          loader: "typings-for-css-modules-loader",
          options: {
            sourceMap: true,
            importLoaders: 1,
            modules: true,
            camelCase: true,
            localIdentName: "[local]_[hash:base64:7]",
            minimize: false,
            namedExport: true
          }
        },
        postCssLoader,
        {
          loader: 'sass-loader' // required to correctly handle sass-style imports
        }
      ]
    },
      {
        test: /^(?!.*\.module\.scss$).*\.scss$/i,          // regular .scss files without modules support
        use: [
          {
            loader: msThemedStyleLoader,   // support for themes
            options: {
              async: true
            }
          },
          postCssLoader,
          {
            loader: 'sass-loader' // required to correctly handle sass-style imports
          }
        ]
      });

    return baseConfig;
  }
})

build.initialize(gulp);
