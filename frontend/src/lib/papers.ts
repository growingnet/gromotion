/**
 * Papers behind the growth methods this site replays, newest first.
 *
 * Data rather than markup, so adding a paper is one object here and no change
 * to the page that lists them. Author names and the BibTeX bodies are taken
 * from each paper's published version - the camera-ready PDF or the venue's
 * own export - so they are transcribed, not reconstructed.
 */
export type Paper = {
  title: string;
  authors: string;
  year: string;
  venue: string;
  url: string;
  /** Optional: not every paper has a preprint up yet. */
  arxiv?: string;
  bibtex: string;
};

export const PAPERS: Paper[] = [
  {
    title:
      "Tackling brain signal inter-subject variability with adaptive neural architectures",
    authors:
      "Velut, S., Douka, S., Rudkiewicz, T., Davey, A., Rivaud, S., Landes, F., Mille, J., Charpiat, G., Chevallier, S., Corsi, M.-C., Dehais, F.",
    year: "2026",
    venue: "International Joint Conference on Neural Networks (IJCNN)",
    url: "http://linklings.s3.amazonaws.com/organizations/WCCI/wcci2026/submissions/stype114/GycdL-ijcnn_pap3256s2.pdf",
    bibtex: `@inproceedings{velut2026tackling,
    title     = {Tackling brain signal inter-subject variability with adaptive neural architectures},
    author    = {Velut, S{\\'e}bastien and Douka, Stella and Rudkiewicz, Th{\\'e}o and Davey, Alex and Rivaud, St{\\'e}phane and Landes, Fran{\\c{c}}ois P. and Mille, Julien and Charpiat, Guillaume and Chevallier, Sylvain and Corsi, Marie-Constance and Dehais, Fr{\\'e}d{\\'e}ric},
    booktitle = {International Joint Conference on Neural Networks (IJCNN)},
    year      = {2026},
}`,
  },
  {
    title: "Growth strategies for arbitrary DAG neural architectures",
    authors:
      "Douka, S., Verbockhaven, M., Rudkiewicz, T., Rivaud, S., Landes, F., Chevallier, S., Charpiat, G.",
    year: "2025",
    venue: "European Symposium on Artificial Neural Networks (ESANN)",
    url: "https://www.esann.org/sites/default/files/proceedings/2025/ES2025-112.pdf",
    arxiv: "https://arxiv.org/abs/2501.12690",
    bibtex: `@inproceedings{douka2025growth,
    title     = {Growth strategies for arbitrary {DAG} neural architectures},
    author    = {Douka, Stella and Verbockhaven, Manon and Rudkiewicz, Th{\\'e}o and Rivaud, St{\\'e}phane and Landes, Fran{\\c{c}}ois P. and Chevallier, Sylvain and Charpiat, Guillaume},
    booktitle = {ESANN 2025 proceedings, European Symposium on Artificial Neural Networks, Computational Intelligence and Machine Learning},
    address   = {Bruges, Belgium},
    pages     = {443--448},
    publisher = {i6doc.com},
    isbn      = {9782875870933},
    year      = {2025},
    url       = {https://www.esann.org/sites/default/files/proceedings/2025/ES2025-112.pdf},
    eprint    = {2501.12690},
    archivePrefix = {arXiv},
}`,
  },
  {
    title:
      "Growing tiny networks: Spotting expressivity bottlenecks and fixing them optimally",
    authors: "Verbockhaven, M., Rudkiewicz, T., Chevallier, S., Charpiat, G.",
    year: "2024",
    venue: "Transactions on Machine Learning Research (TMLR)",
    url: "https://openreview.net/forum?id=hbtG6s6e7r",
    arxiv: "https://arxiv.org/abs/2405.19816",
    bibtex: `@article{verbockhaven2024growing,
    title={Growing Tiny Networks: Spotting Expressivity Bottlenecks and Fixing Them Optimally},
    author={Manon Verbockhaven and Th{\\'e}o Rudkiewicz and Sylvain Chevallier and Guillaume Charpiat},
    journal={Transactions on Machine Learning Research},
    issn={2835-8856},
    year={2024},
    url={https://openreview.net/forum?id=hbtG6s6e7r},
    note={}
}`,
  },
];
