export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Invalid file content"));
        return;
      }
      const encoded = reader.result.split(",")[1];
      if (!encoded) {
        reject(new Error("Invalid file content"));
        return;
      }
      resolve(encoded);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
