let nodemailer = require('nodemailer')

const mailHost = process.env.MAIL_HOST || 'sandbox.smtp.mailtrap.io';
const mailPort = Number(process.env.MAIL_PORT || 2525);
const mailUser = (process.env.MAIL_USER || '').trim();
const mailPass = (process.env.MAIL_PASS || '').trim();
const mailFrom = process.env.MAIL_FROM || '"admin@" <admin@nnptud.com>';

const transporter = nodemailer.createTransport({
    host: mailHost,
    port: mailPort,
    secure: false,
    auth: {
        user: mailUser,
        pass: mailPass,
    },
});

module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: mailFrom,
            to: to,
            subject: "mail reset password",
            text: "Click vao day de doi password",
            html: "Click vao <a href=" + url + ">day</a> de doi password",
        });
    },
    sendImportedUserPasswordMail: async function (to, username, password) {
        await transporter.sendMail({
            from: mailFrom,
            to: to,
            subject: "Tai khoan cua ban da duoc tao",
            text: "Tai khoan: " + username + "\nMat khau: " + password + "\nVui long doi mat khau sau khi dang nhap.",
            html: "<p>Tai khoan cua ban da duoc tao.</p>"
                + "<p><b>Tai khoan:</b> " + username + "</p>"
                + "<p><b>Mat khau:</b> " + password + "</p>"
                + "<p>Vui long doi mat khau sau khi dang nhap.</p>",
        });
    }
}