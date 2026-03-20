const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const protect = async (req, res, next) => {
  let token;

  // Development bypass: Allow local requests while we fix the login UI
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.headers.host?.includes('localhost');
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (isLocal && (!token || token === 'null' || token === 'undefined')) {
    return next();
  }

  if (token && token !== 'null' && token !== 'undefined') {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.adminId = decoded.id;
      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  res.status(401).json({ message: 'Not authorized, no token' });
};

module.exports = { generateToken, protect };
