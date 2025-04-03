exports.notFound = (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${req.originalUrl} non trouvée`
      }
    });
  };
  
  exports.globalError = (err, req, res, next) => {
    console.error(err.stack);
    
    const statusCode = err.statusCode || 500;
    const errorResponse = {
      success: false,
      error: {
        code: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Erreur interne du serveur',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      }
    };
  
    res.status(statusCode).json(errorResponse);
  };