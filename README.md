# 🎂 Nimay's Birthday Gift

A React web app hosted on GitHub Pages with real-time Firebase sync. Tracks 30 hours of time gifted from Nirav to Nimay.

---

## 🛠 Setup Instructions

### 1. Firebase Configuration

You need to get your Firebase Web App config and paste it into `src/firebase.js`.

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project `nimay-s-30th-birthday-gift`
2. Click the ⚙️ gear icon → **Project Settings**
3. Scroll to **"Your apps"** → click the `</>` (Web) icon if you haven't registered a web app yet
4. Copy the `firebaseConfig` object — it looks like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "nimay-s-30th-birthday-gift.firebaseapp.com",
  databaseURL: "https://nimay-s-30th-birthday-gift-default-rtdb.firebaseio.com/",
  projectId: "nimay-s-30th-birthday-gift",
  storageBucket: "nimay-s-30th-birthday-gift.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

5. Open `src/firebase.js` and replace the placeholder values with your real config.

---

### 2. Enable Anonymous Authentication in Firebase

1. In Firebase Console → **Authentication** → **Sign-in method**
2. Click **Anonymous** → toggle **Enable** → Save

---

### 3. Set Firebase Realtime Database Rules

In Firebase Console → **Realtime Database** → **Rules**, set:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

This ensures only anonymously-authenticated users (i.e., anyone who loads the page) can read/write.

---

### 4. Install Dependencies & Run Locally

```bash
npm install
npm start
```

App will run at `http://localhost:3000`.

---

### 5. Deploy to GitHub Pages

1. Update `package.json` → set `"homepage"` to your actual GitHub Pages URL:
   ```
   "homepage": "https://YOUR_GITHUB_USERNAME.github.io/nimay-birthday-gift"
   ```

2. Create a GitHub repo named `nimay-birthday-gift` and push the code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/nimay-birthday-gift.git
   git push -u origin main
   ```

3. Deploy:
   ```bash
   npm run deploy
   ```

4. In GitHub → your repo → **Settings** → **Pages**, make sure source is set to `gh-pages` branch.

Your app will be live at: `https://YOUR_USERNAME.github.io/nimay-birthday-gift`

---

## 🔑 Password

The edit/delete password is hardcoded as:
```
Nirav is Lyla's absolute favorite
```

---

## 📦 Project Structure

```
src/
  App.js        — Main app + all modal components
  App.css       — All styles (dark birthday theme)
  firebase.js   — Firebase config & auth setup
  index.js      — React entry point
public/
  index.html    — HTML shell
```
