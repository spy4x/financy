self.addEventListener("push", (event) => {
  const data = event.data.json()
  event.waitUntil(
    // TODO: add "icon": path_to_static_icon to second parameter in showNotification
    self.registration.showNotification(data.title, {
      body: data.body,
      data: {
        url: data.url,
      },
    }),
  )
})

self.addEventListener("notificationclick", function (event) {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(self.location.origin + event.notification.data.url),
  )
})
