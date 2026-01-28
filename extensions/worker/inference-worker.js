self.addEventListener('message', (event) => {
    self.postMessage({ ok: true, echo: event.data });
});
console.log("inference worker loaded");

//listen for messages
 self.onmessage = (event) => {
    console.log("inference worker received message:", event.data);

    //send back a response
self.postMessage ({status: "worker ready"});
 };