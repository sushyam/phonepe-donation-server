const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Create email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Generate PDF receipt
const generateReceipt = async (donation) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const filename = `receipt_${donation._id}.pdf`;
      const filepath = path.join(__dirname, '..', 'uploads', filename);

      // Ensure uploads directory exists
      if (!fs.existsSync(path.join(__dirname, '..', 'uploads'))) {
        fs.mkdirSync(path.join(__dirname, '..', 'uploads'));
      }

      // Pipe PDF to file
      doc.pipe(fs.createWriteStream(filepath));

      // Add content to PDF
      doc
        .fontSize(20)
        .text('Donation Receipt', { align: 'center' })
        .moveDown();

      doc
        .fontSize(12)
        .text(`Receipt No: ${donation._id}`)
        .text(`Date: ${new Date(donation.createdAt).toLocaleDateString()}`)
        .text(`Donor Name: ${donation.donorInfo.name}`)
        .text(`Amount: ₹${donation.amount}`)
        .text(`Payment ID: ${donation.paymentId}`)
        .text(`Donation Type: ${donation.type.toUpperCase()}`)
        .moveDown();

      if (donation.type === 'family') {
        doc
          .text('Family Members:')
          .moveDown();
        
        donation.familyInfo.familyMembers.forEach(member => {
          doc.text(`- ${member.name} (${member.relation}, ${member.age} years)`);
        });
      }

      doc
        .moveDown()
        .fontSize(10)
        .text('Thank you for your generous donation!', { align: 'center' });

      // Finalize PDF
      doc.end();

      resolve(filepath);
    } catch (error) {
      reject(error);
    }
  });
};

// Send receipt via email
const sendReceiptEmail = async (donation, pdfPath) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: donation.donorInfo.email,
      subject: 'Thank you for your donation!',
      html: `
        <h2>Thank you for your donation!</h2>
        <p>Dear ${donation.donorInfo.name},</p>
        <p>We have received your donation of ₹${donation.amount}. Please find the receipt attached.</p>
        <p>Payment Details:</p>
        <ul>
          <li>Receipt No: ${donation._id}</li>
          <li>Date: ${new Date(donation.createdAt).toLocaleDateString()}</li>
          <li>Amount: ₹${donation.amount}</li>
          <li>Payment ID: ${donation.paymentId}</li>
          <li>Donation Type: ${donation.type.toUpperCase()}</li>
        </ul>
        <p>Thank you for your support!</p>
      `,
      attachments: [{
        filename: path.basename(pdfPath),
        path: pdfPath
      }]
    };

    await transporter.sendMail(mailOptions);

    // Delete PDF file after sending
    fs.unlinkSync(pdfPath);
  } catch (error) {
    console.error('Error sending receipt email:', error);
    throw error;
  }
};

module.exports = {
  generateReceipt,
  sendReceiptEmail
};
