'use strict';

function validate(schema) {
  return (req, res, next) => {
    const data = { ...req.body, ...req.query, ...req.params };
    const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'Validation failed', details: error.details });
    req.validated = value;
    return next();
  };
}

module.exports = { validate };
