import jwt from "jsonwebtoken";

export const adminLogin = (req, res) => {
  const { username, password } = req.body || {};
  console.log(req.body)
  console.log("⇢ DEBUG-LOGIN:", { username, password });   // ← add this

  if (
    username !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASS
  ) return res.status(401).json({ msg: "Bad creds" });

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "15d",
  });
  res.json({ token });
};


/* POST /api/admin-refresh  (validates token first) */
export const refresh = (req, res) => {
  const { username } = req.user;      // set by auth middleware
  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "15d",
  });
  res.json({ token });
};



/* ============================================
   DELETE PASSWORD VERIFICATION
   ============================================ */
export const verifyDeletePassword = (req, res) => {
  const { password } = req.body;

  console.log("🔒 Verifying delete password");

  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password is required"
    });
  }

  if (password !== process.env.DELETE_PASSWORD) {
    console.log("❌ Invalid delete password");
    return res.status(401).json({
      success: false,
      message: "Invalid password"
    });
  }

  console.log("✅ Delete password verified");
  return res.json({
    success: true,
    message: "Password verified"
  });
};

