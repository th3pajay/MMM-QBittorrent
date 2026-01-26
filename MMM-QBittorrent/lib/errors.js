class QBConnectionError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'QBConnectionError';
    this.statusCode = statusCode;
  }
}

class QBAuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QBAuthenticationError';
  }
}

class QBTimeoutError extends Error {
  constructor(timeout) {
    super(`Request timed out after ${timeout}ms`);
    this.name = 'QBTimeoutError';
    this.timeout = timeout;
  }
}

module.exports = {
  QBConnectionError,
  QBAuthenticationError,
  QBTimeoutError
};
