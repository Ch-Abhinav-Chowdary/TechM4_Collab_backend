const multer = require('multer');
const path = require('path');

// Set up storage engine
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  },
});

// Initialize upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // Limit file size to 10MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
}).single('file'); // 'file' is the name of the form field

// Check file type
function checkFileType(file, cb) {
  // Allowed extensions
  const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|ppt|pptx|xls|xlsx/;
  // Check ext
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Images, Documents, and Presentations Only!');
  }
}

module.exports = upload; 