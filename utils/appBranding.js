const launcherIcons = ['default', 'emerald', 'gold'];
const notificationIcons = ['ic_notification', 'ic_notification_star', 'ic_notification_compass'];
function validateBranding(key, ta, en) {
  if (key === 'notification_icon' && typeof en === 'string' && en.startsWith('{')) {
    const icon = customIcon(en);
    if (ta !== en || !icon) throw new Error('Choose a valid uploaded notification icon.');
    return;
  }
  const options = key === 'launcher_icon' ? launcherIcons : key === 'notification_icon' ? notificationIcons : null;
  if (options && (ta !== en || !options.includes(en))) throw new Error('Select a supported bundled icon.');
}
function customIcon(value) {
  try {
    const icon = JSON.parse(value);
    if (typeof icon.label !== 'string' || !icon.label.trim() || icon.label.length > 80 || typeof icon.imageUrl !== 'string' || !/^\/uploads\/notification-icons\/[a-f0-9-]{36}\.png$/.test(icon.imageUrl)) return null;
    return { label: icon.label, imageUrl: icon.imageUrl };
  } catch (_) { return null; }
}
function notificationIcon(value) {
  return notificationIcons.includes(value) ? value : 'ic_notification';
}
module.exports = { validateBranding, notificationIcon, customIcon };
