export default function Loading() {
  return (
    <div className="app-loader">
      <div id="loader" aria-label="Loading" role="status">
        <div id="hill" />
        <div id="box" />
      </div>

      <style>{`
        .app-loader {
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: radial-gradient(circle at 30% 20%, rgba(124, 108, 255, 0.18), transparent 55%),
            radial-gradient(circle at 80% 75%, rgba(34, 211, 238, 0.12), transparent 50%),
            #0b1020;
          overflow: hidden;
        }

        #loader {
          position: relative;
          width: 5.4em;
          height: 5.4em;
        }

        #hill {
          position: absolute;
          width: 7.1em;
          height: 7.1em;
          top: 1.7em;
          left: 1.7em;
          background-color: transparent;
          border-left: 0.25em solid rgba(226, 232, 240, 0.9);
          transform: rotate(45deg);
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.6));
        }

        #hill:after {
          content: '';
          position: absolute;
          width: 7.1em;
          height: 7.1em;
          left: 0;
          background: transparent;
        }

        #box {
          position: absolute;
          left: 0;
          bottom: -0.1em;
          width: 1em;
          height: 1em;
          background-color: transparent;
          border: 0.25em solid rgba(226, 232, 240, 0.9);
          border-radius: 15%;
          transform: translate(0, -1em) rotate(-45deg);
          animation: push 2.5s cubic-bezier(0.79, 0, 0.47, 0.97) infinite;
          box-shadow: 0 0 25px rgba(124, 108, 255, 0.35);
        }

        @keyframes push {
          0% {
            transform: translate(0, -1em) rotate(-45deg);
          }
          5% {
            transform: translate(0, -1em) rotate(-50deg);
          }
          20% {
            transform: translate(1em, -2em) rotate(47deg);
          }
          25% {
            transform: translate(1em, -2em) rotate(45deg);
          }
          30% {
            transform: translate(1em, -2em) rotate(40deg);
          }
          45% {
            transform: translate(2em, -3em) rotate(137deg);
          }
          50% {
            transform: translate(2em, -3em) rotate(135deg);
          }
          55% {
            transform: translate(2em, -3em) rotate(130deg);
          }
          70% {
            transform: translate(3em, -4em) rotate(217deg);
          }
          75% {
            transform: translate(3em, -4em) rotate(220deg);
          }
          100% {
            transform: translate(0, -1em) rotate(-225deg);
          }
        }
      `}</style>
    </div>
  );
}

