
export async function download(url) {
  const response = await fetch(url);
  const file = await response.blob();
  const options = {
    types: [
      {
        description: "All Files",
        accept: {
          "application/octet-stream": [".png"],
        },
      },
    ],
    suggestedName: `${getFormattedDate()}.png`,
  };

  // Check if the API System Access API is available
  if ("showSaveFilePicker" in window) {
    try {
      // Allows the user to choose a directory and a file name
      const handle = await window.showSaveFilePicker(options);
      const writableStream = await handle.createWritable();
      await writableStream.write(file);
      await writableStream.close();
    } catch (err) {
      console.error(err);
    }
  } else {
    // Fallback to download if File System Access is not available
    let tUrl = URL.createObjectURL(file);
    const tmp1 = document.createElement("a");
    tmp1.href = tUrl;
    tmp1.download = `${getFormattedDate()}.png`;
    document.body.appendChild(tmp1);
    tmp1.click();
    URL.revokeObjectURL(tUrl);
    tmp1.remove();
  }
}

function getFormattedDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
