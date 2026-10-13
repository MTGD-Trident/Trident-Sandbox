// Tells page scripts the user has opted out of data sale/sharing (Global Privacy Control).
Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
  get: () => true,
  configurable: true,
  enumerable: true,
});
