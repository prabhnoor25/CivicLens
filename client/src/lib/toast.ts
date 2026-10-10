type Kind = "success" | "error" | "info";
type Listener = (kind: Kind, message: string) => void;

const listeners = new Set<Listener>();

const toast = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  show(kind: Kind, message: string) {
    listeners.forEach((fn) => fn(kind, message));
  },
  success(message: string) {
    this.show("success", message);
  },
  error(message: string) {
    this.show("error", message);
  },
  info(message: string) {
    this.show("info", message);
  },
};

export default toast;
