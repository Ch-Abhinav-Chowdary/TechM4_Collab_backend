const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');

router.post('/', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      res.status(400).json({ msg: err });
    } else {
      if (req.file == undefined) {
        res.status(400).json({ msg: 'Error: No File Selected!' });
      } else {
        res.status(200).json({
          msg: 'File Uploaded!',
          file: `uploads/${req.file.filename}`,
        });
      }
    }
  });
});

module.exports = router; 