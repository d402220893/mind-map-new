const path = require('path')
const isDev = process.env.NODE_ENV === 'development'
const isLibrary = process.env.NODE_ENV === 'library'

const webpack = require('webpack')
const WebpackDynamicPublicPathPlugin = require('webpack-dynamic-public-path')

module.exports = {
  publicPath: isDev ? '' : './dist',
  outputDir: '../dist',
  lintOnSave: false,
  productionSourceMap: false,
  filenameHashing: false,
  transpileDependencies: ['yjs', 'lib0', 'quill', 'mp4-muxer'],
  chainWebpack: config => {
    // 移除 preload 插件
    config.plugins.delete('preload')
    // 移除 prefetch 插件
    config.plugins.delete('prefetch')
    // 支持运行时设置public path
    if (!isDev) {
      config
        .plugin('dynamicPublicPathPlugin')
        .use(WebpackDynamicPublicPathPlugin, [
          { externalPublicPath: 'window.externalPublicPath' }
        ])
    }
    // 给插入html页面内的js和css添加hash参数
    if (!isLibrary) {
      config.plugin('html').tap(args => {
        args[0].hash = true
        return args
      })
    }
    // 低内存构建：关闭 terser 并行以削减峰值内存，避免受限环境下 OOM 被杀。
    // 用法：BUILD_LOW_MEM=1 vue-cli-service build
    if (process.env.BUILD_LOW_MEM === '1') {
      try {
        config.optimization.minimizer('terser').tap(args => {
          args[0] = Object.assign({}, args[0] || {}, { parallel: false })
          return args
        })
      } catch (e) {
        // 若内部 minimizer 名称不同则忽略，不影响主构建
      }
    }
  },
  configureWebpack: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/')
      },
      // webpack 5 不再自动 polyfill node 核心模块。
      // 部分依赖（如 pptxgenjs 的浏览器 bundle）里带有 node 分支的 require，
      // 运行时并不会真正调用它们，这里统一声明为不参与打包。
      fallback: {
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        url: false,
        http: false,
        https: false,
        zlib: false,
        events: false,
        assert: false,
        constants: false,
        child_process: false,
        net: false,
        tls: false,
        dns: false,
        module: false,
        worker_threads: false
      }
    },
    plugins: [
      // 把 `node:fs` / `node:https` 这类带 scheme 的请求还原成裸模块名，
      // 再交给上面的 fallback 处理，避免 webpack5 报 "Unhandled scheme"。
      new webpack.NormalModuleReplacementPlugin(/^node:/, resource => {
        resource.request = resource.request.replace(/^node:/, '')
      })
    ]
  },
  devServer: {
    proxy: {
      '^/api/v3/': {
        target: 'http://ark.cn-beijing.volces.com',
        changeOrigin: true
      }
    }
  }
}
