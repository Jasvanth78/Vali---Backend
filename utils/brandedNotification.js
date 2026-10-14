async function sendBrandedNotification(messaging, devices, payload, customIcon) {
  if (!customIcon) return messaging.sendEachForMulticast({ ...payload, tokens: devices.map(device => device.token) });
  const modern = [], legacy = [];
  devices.forEach((device, index) => (device.platform === 'android' && device.customNotificationIcons === true ? modern : legacy).push({ device, index }));
  const responses = new Array(devices.length);
  for (const group of [legacy, modern]) {
    if (!group.length) continue;
    const message = { ...payload, tokens: group.map(row => row.device.token) };
    if (group === modern) {
      delete message.notification;
      message.android = { priority: 'high' };
      message.data = { ...payload.data, renderer: 'native-icon-v1', notificationIconUrl: customIcon.imageUrl, ...(payload.notification?.imageUrl ? { imageUrl: payload.notification.imageUrl } : {}) };
    }
    const result = await messaging.sendEachForMulticast(message);
    group.forEach((row, index) => { responses[row.index] = result.responses[index]; });
  }
  const successCount = responses.filter(response => response.success).length;
  return { responses, successCount, failureCount: responses.length - successCount };
}
module.exports = { sendBrandedNotification };
