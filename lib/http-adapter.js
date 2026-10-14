const https = require("https")
const http = require("http")

function createHttpAdapter({ tlsOptions = () => ({}) } = {}) {
  return {
    request({ url, method = "GET", headers = {}, body = null, timeout = 5000 }) {
      return new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const isHttps = parsed.protocol === "https:"
        const options = {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method,
          headers: { ...headers }
        }
        if (isHttps) Object.assign(options, tlsOptions())
        if (body) options.headers["Content-Length"] = Buffer.byteLength(body, "utf8")

        const req = (isHttps ? https : http).request(options, res => {
          let data = ""
          res.on("data", chunk => { data += chunk })
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
        })

        const timer = setTimeout(() => {
          const err = new Error("Request timeout")
          err.code = "TIMEOUT"
          req.destroy()
          reject(err)
        }, timeout)

        req.on("error", reject)
        req.on("close", () => clearTimeout(timer))

        if (body) req.write(body)
        req.end()
      })
    }
  }
}

module.exports = { createHttpAdapter }
