const editor = document.getElementById("editor");
const codeView = document.getElementById("codeView");
const toggleCode = document.getElementById("toggleCode");
const colorPicker = document.getElementById("colorPicker");

export function richEditor() {

    document.querySelectorAll(".toolbar button[data-command]").forEach(button => {
        button.addEventListener("click", () => {
            let command = button.getAttribute("data-command");
            if (command === "createLink") {
                let url = prompt("Masukkan URL:");
                if (url) document.execCommand(command, false, url);
            } else if (command === "insertImage") {
                let imgUrl = prompt("Masukkan URL gambar:");
                if (imgUrl) document.execCommand(command, false, imgUrl);
            } else {
                document.execCommand(command, false, null);
            }
            saveNotes();
        });
    });

    colorPicker.addEventListener("input", () => {
        document.execCommand("foreColor", false, colorPicker.value);
        saveNotes();
    });

    toggleCode.addEventListener("click", () => {
        if (codeView.style.display === "none") {
            codeView.value = editor.innerHTML;
            editor.style.display = "none";
            codeView.style.display = "block";
        } else {
            editor.innerHTML = codeView.value;
            editor.style.display = "block";
            codeView.style.display = "none";
            saveNotes();
        }
    });

}