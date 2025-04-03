const maskSensitiveData = (body) => {
    if (!body) return body;
    const sensitiveFields = ['password', 'adminPass', 'secret'];
    const maskedBody = { ...body };
    
    sensitiveFields.forEach(field => {
      if (maskedBody[field]) {
        maskedBody[field] = '*****';
      }
    });
    
    return maskedBody;
  };
  
  exports.requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log({
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: `${duration}ms`,
        body: maskSensitiveData(req.body)
      });
    });
  
    next();
  };