# Base CV Versioning

## MVP decision

`cv.md` is the active exact baseline. Never overwrite it silently.

When the user approves a materially improved base CV:

1. copy the previous baseline into the gitignored `assets/base-cvs/` folder with a date/version;
2. save the approved new baseline as `cv.md` and another dated asset;
3. record a brief change note in the candidate's user layer;
4. keep role-specific CVs in `output/`; they never become a base CV automatically.

The user may maintain product, consulting, sales, founder/operator, or other role-family baselines in `assets/base-cvs/`. The agent asks which one to use when the target is unclear. Major repositioning remains draft until confirmed.

The removed typed `baseCvs` registry is not an MVP dependency. A structured multi-profile/base-CV registry belongs in V1 after the single-candidate loop is proven.
