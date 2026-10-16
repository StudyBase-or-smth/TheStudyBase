# Mathematics Standard HSC imports

Imported the supplied 2024 Standard 1 and Standard 2 papers and the supplied
2025 Standard 2 paper with their matching NESA marking guidelines. The source
PDFs remain unchanged in `C:/Users/Ethan/Desktop/school/HSC/math`.

| Paper | Pack | Paper | Marking guide |
| --- | --- | --- | --- |
| 2024 Standard 1 | [NESA 2024 pack](https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/mathematics-standard/2024) | [Paper PDF](https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-1.pdf) | [Guidelines PDF](https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-1-mg.pdf) |
| 2024 Standard 2 | [NESA 2024 pack](https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/mathematics-standard/2024) | [Paper PDF](https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-2.pdf) | [Guidelines PDF](https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-2-mg.pdf) |
| 2025 Standard 2 | [NESA 2025 pack](https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/mathematics-standard/2025) | [Paper PDF](https://www.nsw.gov.au/sites/default/files/noindex/2025-10/2025-hsc-maths-standard-2.pdf) | [Guidelines PDF](https://www.nsw.gov.au/sites/default/files/noindex/2025-11/2025-hsc-maths-standard-2-mg.pdf) |

The six section JSON files are registered in `manifest.json`. Section I contains
10 or 15 multiple-choice questions, with answer keys transcribed from the matching
guide. Section II contains each independently marked task and its actual marks;
the written totals are 70, 85 and 85. Data and response tables use native table
blocks. Blank cells are response fields only when the paper asks the student to
complete the table. Source diagrams and graphical answer choices are figure crops,
not question-page screenshots.

The 2024 guidelines were captured as text from the linked official PDFs and kept
in `scripts/data/` for repeatable regeneration. The 2025 guide is read from the
supplied local PDF. The importer expects the four supplied paper/guideline PDFs in
the source directory configured at the top of `scripts/import-maths-hsc.py`.

Manually checked and restored PDF layout notation and missing text for 2024
Standard 2 Q1, Q10, Q13, Q22 and Q24(a), 2025 Standard 1 Q4, Q6–Q11 and Q13, and
2025 Standard 2 Q22. The 2024 Standard 1 right-triangle options were reviewed and
transcribed in order. Reviewed diagram crops include 2024 Standard 1 Q9–Q10,
2024 Standard 2 Q2, 2025 Standard 2 Q2, and the histogram and spinner-choice
panels in 2025 Standard 2 Q8. These crop coordinates are recorded in the importer.
