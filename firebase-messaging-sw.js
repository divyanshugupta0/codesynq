// Firebase messaging service worker
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyD-SfBy_r93JDZOrYM8YUaokyNDXolVUzI",
    authDomain: "codenexus-cbb96.firebaseapp.com",
    databaseURL: "https://codenexus-cbb96-default-rtdb.firebaseio.com",
    projectId: "codenexus-cbb96",
    storageBucket: "codenexus-cbb96.firebasestorage.app",
    messagingSenderId: "11546353758",
    appId: "1:11546353758:web:e280574d9e6d9d6c1fd4cf"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/favicon.ico'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});