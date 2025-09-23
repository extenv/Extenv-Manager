// Make sure Quill and QuillResizeModule are loaded via <script> tags in your HTML, not here.

document.addEventListener('DOMContentLoaded', function () {
    Quill.register('modules/imageResize', QuillResizeModule);
    const quill = new Quill('#editor', {
        modules: {
            imageResize: {
                displaySize: true
            },
            toolbar: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline'],
                ['image', 'code-block', 'video', 'table'],
            ]
        },
        placeholder: 'Compose an epic...',
        theme: 'snow'
    });
});