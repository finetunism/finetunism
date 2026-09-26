<div align="center">

<a href="https://finetunism.science">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=28&duration=2800&pause=900&color=E4E4E4&center=true&vCenter=true&width=620&lines=FINETUNISM;hardware+%C2%B7+software+%C2%B7+security" alt="finetunism" />
</a>

Embedded electronics · mechanical design · applied chemistry · security research

[![blog](https://img.shields.io/badge/blog-finetunism.science-111?style=flat-square&logo=cloudflare&logoColor=F38020)](https://finetunism.science)
[![advisory](https://img.shields.io/badge/GHSA--858h--whjf--mvg5-high%208.1-d73a49?style=flat-square&logo=github)](https://github.com/steveukx/git-js/security/advisories/GHSA-858h-whjf-mvg5)

</div>

---

### 🛡️ Security

> [!IMPORTANT]
> **[GHSA-858h-whjf-mvg5](https://github.com/steveukx/git-js/security/advisories/GHSA-858h-whjf-mvg5)**: command execution in [`simple-git`](https://github.com/steveukx/git-js), the Node.js git wrapper that gets millions of downloads a week.

| | |
|---|---|
| **Severity** | 🔴 High, CVSS **8.1** |
| **Class** | CWE-77 command injection · CWE-88 argument injection |
| **Affected** | `simple-git <= 3.36.0` → patched in **4.0.0** |
| **Credit** | Reporter (as [@internetteletubbie](https://github.com/internetteletubbie)) |

`simple-git` has a plugin called `blockUnsafeOperationsPlugin` that blocks dangerous flags like `--receive-pack` and `--exec`. Git also accepts any unambiguous prefix of a long option, so `--receive-p` and `--exe` got past the filter while git ran them as the full flags. A crafted `push` to a local or `file://` remote could then run arbitrary commands.

---

### 🔧 Recent projects

<table>
<tr>
<td width="50%" valign="top">

#### 🎧 [e-ink mp3 player](https://finetunism.science/posts/building-my-own-mp3-player/)
A pocket music player for offline `.wav` files I own byte for byte. It uses a XIAO ESP32-S3, a 2.13" e-ink display, a PCM5102 I²S DAC, a microSD card and a LiPo battery. The look comes from the paper *panneaux déroulants* ad displays in Lyon. The case is designed in FreeCAD and 3D printed.

`ESP32-S3` `I²S` `e-ink` `FreeCAD`

</td>
<td width="50%" valign="top">

#### 🚪 [decoding a file stored on my bathroom door](https://finetunism.science/posts/decoding-a-file-stored-in-my-bathroom-door/)
Can you store and read back data in the grain of a wooden door? Image thresholding, a Python decoder, and "magic bytes" hidden in the door frame. It's steganography as a thought experiment that got out of hand.

`Python` `image processing` `steganography`

</td>
</tr>
<tr>
<td width="50%" valign="top">

#### ⚗️ [extracting elemental iodine from a pharmacy product](https://finetunism.science/posts/exctracting-elemental-iodide-from-an-amazon-product/)
A home-lab extraction that isolates I₂ crystals from Lugol's solution (I₂ + KI). The post works through the triiodide equilibrium and why the separation is harder than it looks.

`chemistry` `home lab`

</td>
<td width="50%" valign="top">

#### 🔢 contador · 🎚️ rpi sequencer · 🎛️ gear mounts
A mechanical click counter with an OLED display, a Raspberry Pi 3B+ sequencer enclosure, a Focusrite interface stand and a headphone clamp. They're all designed in CAD, iterated over several versions and printed on a Bambu.

`Arduino` `FreeCAD` `Bambu Studio`

</td>
</tr>
</table>

### 🌐 Blog

I write about my projects at **[finetunism.science](https://finetunism.science)**.
