import express from 'express';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Hanya load dotenv kalau environment bukan production (bisa hapus ini jika di Railway)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();
app.use(express.json());

const {
  EMAIL_USER,
  EMAIL_PASS,
  SUPABASE_URL,
  SUPABASE_KEY,
  PORT = 8080,
} = process.env;

if (!EMAIL_USER || !EMAIL_PASS || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ ENV belum lengkap.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email diperlukan' });

    // Bisa tambah validasi email sederhana, misal regex (optional)

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await supabase.from('otps').delete().lt('created_at', twoMinutesAgo);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const { error } = await supabase
      .from('otps')
      .upsert({ email, otp, created_at: new Date().toISOString() });

    if (error) return res.status(500).json({ error: error.message });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: email,
      subject: 'Kode OTP Anda',
      text: `Kode OTP Anda adalah ${otp}. Berlaku selama 2 menit.`,
    });

    res.json({ message: 'OTP terkirim ke email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

app.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ error: 'Email dan OTP diperlukan' });

    // Bisa tambah validasi input (opsional)

    const { data, error } = await supabase
      .from('otps')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) return res.status(400).json({ error: 'OTP tidak ditemukan.' });

    const isValid = data.otp === otp;
    const createdAt = new Date(data.created_at);
    const now = new Date();
    const expired = now - createdAt > 2 * 60 * 1000; // 2 menit

    if (!isValid) return res.status(400).json({ error: 'OTP salah.' });
    if (expired) return res.status(400).json({ error: 'OTP sudah kedaluwarsa.' });

    res.json({ message: 'OTP valid.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));
