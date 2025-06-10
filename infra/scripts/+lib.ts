export function success(...args: any[]) {
    console.log(`%c${args.join(" ")}`, "color: green; font-weight: bold");
  }
  export function error(...args: any[]) {
    console.error(`%c${args.join(" ")}`, "color: red; font-weight: bold");
  }
 
export function log(...args: any[]) {
    console.log(...args);
  }