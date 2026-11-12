(function () {
  var storageKey = "re-office.shared-topic";
  try {
    var params = new URLSearchParams(location.search);
    var removedQuery = false;
    ["topic", "t", "ntfy", "ntfy_topic"].forEach(function (key) {
      if (params.has(key)) {
        params.delete(key);
        removedQuery = true;
      }
    });
    var hash = location.hash || "";
    var topic = "";
    if (hash.length > 1) {
      var body = hash.slice(1);
      var raw = body;
      if (body.indexOf("topic=") === 0 || body.indexOf("t=") === 0) {
        raw = body.slice(body.indexOf("=") + 1);
      }
      try {
        raw = decodeURIComponent(raw);
      } catch (error) {
        raw = "";
      }
      if (/^[A-Za-z0-9_-]{1,64}$/.test(raw)) topic = raw;
    }
    if (topic) sessionStorage.setItem(storageKey, topic);
    if (topic || removedQuery || hash.length > 1) {
      var search = params.toString();
      history.replaceState(null, "", location.pathname + (search ? "?" + search : ""));
    }
  } catch (error) {
    /* Keep the topic out of any thrown message. */
  }
})();
