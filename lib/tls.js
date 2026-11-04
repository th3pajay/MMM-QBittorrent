const path = require("path")

const listOf = value => (Array.isArray(value) ? value : [value])

function createTls({ tls, baseDir, fs = require("fs") }) {
  const resolve = filePath => (path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath))
  let cached = null

  return {
    check() {
      const errors = []
      const warnings = []

      if (tls.rejectUnauthorized === false) warnings.push("SSL certificate validation is disabled. Use only for development.")

      try {
        if (tls.ca) {
          for (const p of listOf(tls.ca)) {
            const resolved = resolve(p)
            if (!fs.existsSync(resolved)) errors.push(`CA certificate not found: ${resolved}`)
          }
        }

        if (tls.cert) {
          const resolved = resolve(tls.cert)
          if (!fs.existsSync(resolved)) errors.push(`Client certificate not found: ${resolved}`)
        }

        if (tls.key) {
          const resolved = resolve(tls.key)
          if (!fs.existsSync(resolved)) {
            errors.push(`Private key not found: ${resolved}`)
          } else {
            try {
              const mode = fs.statSync(resolved).mode & 0o777
              if (mode !== 0o600 && mode !== 0o400) {
                warnings.push(`Private key file ${resolved} has overly permissive permissions (${mode.toString(8)}). Consider: chmod 600 ${resolved}`)
              }
            } catch (e) {
              warnings.push(`Key permissions check failed: ${e.message}`)
            }
          }
        }
      } catch (e) {
        errors.push(`Certificate validation error: ${e.message}`)
      }

      return { errors, warnings }
    },

    options() {
      if (cached) return cached

      const options = {}
      if (tls.rejectUnauthorized === false) options.rejectUnauthorized = false
      if (tls.ca) options.ca = listOf(tls.ca).map(p => fs.readFileSync(resolve(p)))
      if (tls.cert && tls.key) {
        options.cert = fs.readFileSync(resolve(tls.cert))
        options.key = fs.readFileSync(resolve(tls.key))
        if (tls.passphrase) options.passphrase = tls.passphrase
      }
      if (tls.minVersion) options.minVersion = tls.minVersion
      if (tls.maxVersion) options.maxVersion = tls.maxVersion

      cached = options
      return options
    }
  }
}

module.exports = { createTls }
