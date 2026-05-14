import express from "express";

const app = express();
app.use(express.json());

app.post("/ussd", (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  // Simple USSD simulation: respond with credential status
  const response = text === ""
    ? "Welcome to Zivana ID. Press 1 to check credential status."
    : text === "1"
    ? "Your credential is valid. Contributor role confirmed."
    : "Invalid option.";
  res.send(response);
});

app.listen(3000, () => console.log("USSD simulator running on port 3000"));
