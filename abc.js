const bcrypt = require('bcrypt');
bcrypt.hash('yourpassword123', 10).then(hash => console.log(hash));
