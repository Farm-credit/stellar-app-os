# Mobile Drawer - Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Start Development Server
```bash
npm run dev
```

### 2. Test Mobile View
- Open http://localhost:3000
- Press F12 (DevTools)
- Press Ctrl+Shift+M (Device Toolbar)
- Select iPhone or Android device

### 3. Test the Drawer
- Click the ☰ hamburger menu
- Navigate through links
- Test wallet connect
- Press Escape to close

## 📋 Quick Test Checklist

### Basic Functionality
- [ ] Hamburger opens drawer
- [ ] Backdrop closes drawer
- [ ] Links navigate correctly
- [ ] Escape key closes drawer

### Wallet Integration
- [ ] "Connect Wallet" button visible
- [ ] Clicking connects Freighter
- [ ] Shows truncated public key
- [ ] Disconnect works

### Accessibility
- [ ] Tab key cycles through elements
- [ ] Focus visible on all elements
- [ ] Escape closes drawer
- [ ] Screen reader announces elements

### Responsive
- [ ] Works on mobile (< 768px)
- [ ] Works on tablet (768px)
- [ ] Desktop shows horizontal nav (≥ 768px)

## 🎯 Key Features

### Animations
- Smooth 300ms slide-in from left
- Backdrop fade effect
- GPU-accelerated transforms

### Accessibility
- WCAG 2.1 AA compliant
- Focus trap when open
- Keyboard navigation
- ARIA labels

### UX
- Auto-close on link click
- Body scroll prevention
- Active page highlighting
- Touch-friendly targets

## 📁 Files to Review

```
components/organisms/Header/
├── Header.tsx              ← Main component
├── MobileDrawer.tsx        ← Drawer logic
├── README.md               ← Full docs
└── VISUAL_GUIDE.md         ← Visual reference
```

## 🔧 Customization

### Change drawer width:
```tsx
// MobileDrawer.tsx, line ~126
className="... w-[280px] ..."  // Change to w-[320px]
```

### Change animation speed:
```tsx
// MobileDrawer.tsx, line ~126
className="... duration-300 ..."  // Change to duration-500
```

### Add navigation link:
```tsx
// MobileDrawer.tsx, line ~22
const navLinks: NavLink[] = [
  // ... existing links
  { href: "/new-page", label: "New Page", icon: YourIcon },
];
```

## 🐛 Troubleshooting

### Drawer not opening?
- Check console for errors
- Verify WalletProviderWrapper in layout
- Ensure lucide-react is installed

### Wallet not connecting?
- Install Freighter browser extension
- Check browser console
- Verify WalletContext is working

### Styling issues?
- Clear browser cache
- Check Tailwind classes
- Verify globals.css is loaded

## 📚 Full Documentation

For complete details, see:
- `ISSUE_47_SUMMARY.md` - Implementation summary
- `MOBILE_DRAWER_IMPLEMENTATION.md` - Full guide
- `components/organisms/Header/README.md` - Component docs
- `components/organisms/Header/VISUAL_GUIDE.md` - Visual guide

## ✅ Ready to Ship

All requirements met:
- ✅ Hamburger menu trigger
- ✅ Slide-in animation
- ✅ All nav links
- ✅ Wallet integration
- ✅ Accessibility compliant
- ✅ TypeScript strict
- ✅ No barrel exports

---

**Need help?** Check the documentation files above or review the code comments.
