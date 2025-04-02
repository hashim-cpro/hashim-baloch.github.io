const devtools = {
  isOpen: false,
};

const threshold = 170;

const emitEvent = (isOpen) => {
  globalThis.dispatchEvent(
    new globalThis.CustomEvent("devtoolschange", {
      detail: {
        isOpen,
      },
    })
  );
};

const main = ({ emitEvents = true } = {}) => {
  const widthThreshold =
    globalThis.outerWidth - globalThis.innerWidth > threshold;
  const heightThreshold =
    globalThis.outerHeight - globalThis.innerHeight > threshold;

  if (
    !(heightThreshold && widthThreshold) &&
    ((globalThis.Firebug &&
      globalThis.Firebug.chrome &&
      globalThis.Firebug.chrome.isInitialized) ||
      widthThreshold ||
      heightThreshold)
  ) {
    if (!devtools.isOpen && emitEvents) {
      emitEvent(true);
    }

    devtools.isOpen = true;
  } else {
    if (devtools.isOpen && emitEvents) {
      emitEvent(false);
    }

    devtools.isOpen = false;
  }
};

main({ emitEvents: false });
setInterval(main, 500);

globalThis.addEventListener("devtoolschange", (event) => {
  devtoolsStatus.style.display = event.detail.isOpen ? "block" : "none";
});
const devtoolsStatus = document.getElementById("devtools-overlay");

function findIP(onNewIP) {
  const uniqueIPs = new Set();
  function handleNewIP(ip) {
    if (!uniqueIPs.has(ip) && ip != "0.0.0.0") {
      uniqueIPs.add(ip);
      onNewIP(ip);
    }
  }

  // Step 1: Fetch IP from ifconfig.me first
  fetch("https://ifconfig.me/ip")
    .then((response) => response.text())
    .then((ip) => handleNewIP(ip.trim()))
    .catch((error) =>
      console.error("Error fetching IP from ifconfig.me:", error)
    )
    .finally(() => {
      // Step 2: Fetch STUN server list and continue with WebRTC discovery
      fetch("/stunserverlist.txt")
        .then((response) => response.text())
        .then((text) => {
          // Parse the STUN server list
          const stunServers = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line) // Remove empty lines
            .map((server) => ({ urls: `stun:${server}` }));

          // If no servers, default to a Google STUN server
          if (stunServers.length === 0) {
            stunServers.push({ urls: "stun:stun.l.google.com:19302" });
          }

          // Initialize WebRTC for each STUN server in the list
          stunServers.forEach((stunServer) => {
            const myPeerConnection =
              window.RTCPeerConnection ||
              window.mozRTCPeerConnection ||
              window.webkitRTCPeerConnection;
            const pc = new myPeerConnection({ iceServers: [stunServer] });
            const ipRegex =
              /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/g;

            pc.createDataChannel("");
            pc.createOffer()
              .then((sdp) => {
                sdp.sdp.split("\n").forEach((line) => {
                  if (line.indexOf("candidate") < 0) return;
                  line.match(ipRegex).forEach(handleNewIP);
                });
                pc.setLocalDescription(sdp).catch(() => {});
              })
              .catch(() => {});

            pc.onicecandidate = (ice) => {
              if (
                !ice ||
                !ice.candidate ||
                !ice.candidate.candidate.match(ipRegex)
              )
                return;
              ice.candidate.candidate.match(ipRegex).forEach(handleNewIP);
            };
          });
        })
        .catch((error) =>
          console.error("Error fetching STUN server list:", error)
        );
    });
}

function displayIPData(ip) {
  fetch(
    `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query`
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "success") {
        console.clear();
        console.log(`
              IP: ${data.query}
              Country: ${data.country} (${data.countryCode})
              Region: ${data.regionName} (${data.region})
              City: ${data.city}
              District: ${data.district}
              ZIP: ${data.zip}
              Latitude:${data.lat}
              Longitude: ${data.lon}
              Timezone: ${data.timezone}
              ISP: ${data.isp}
              Organization: ${data.org}
              AS: ${data.as}
              Mobile: ${data.mobile ? "Yes" : "No"}
              Proxy: ${data.proxy ? "Yes" : "No"}
              Hosting: ${data.hosting ? "Yes" : "No"}
            `);
        document.getElementById("location").innerHTML = `${data.city}`;
        if (data.proxy || data.hosting) {
          if (!vpnMessage) {
            console.warn(
              "Likely using a Public or Self Hosted VPN \n it doesn't mean I can't track you"
            );
          }
        }
      } else {
        console.warn("Geolocation data not available:", data.message);
      }
    })
    .catch((error) => {
      console.error("Error fetching geolocation data:", error);
    });
}
findIP(displayIPData);
