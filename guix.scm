(use-modules
  (guix gexp)
  (guix packages)
  ((guix licenses) #:prefix license:)
  (guix download)
  (guix git-download)
  (guix build-system gnu)
  (gnu packages)
  (gnu packages autotools)
  (gnu packages gnupg)
  (gnu packages guile)
  (gnu packages guile-xyz)
  (gnu packages pkg-config)
  (gnu packages texinfo)
  (gnu packages tls)
  (srfi srfi-1))

(define guile-hoot*
  (let ((commit "db4f8f15c39535b89716e5e9c4a10abb63e51969"))
    (package
     (inherit guile-hoot)
     (version (string-append (package-version guile-hoot)
                             "-1." (string-take commit 7)))
     (source (origin
              (method git-fetch)
              (uri (git-reference
                    (url "https://gitlab.com/spritely/guile-hoot.git")
                    (commit commit)))
              (sha256
               (base32
                "16h7rjq1allg7ym6nxan5a6clq7x12ibb2z6bcln551gl5afzxvz"))))
     (arguments
      '(#:tests? #f)))))

(define (keep-file? file stat)
  (not (any (lambda (my-string)
              (string-contains file my-string))
            (list ".git" ".dir-locals.el" "guix.scm"))))

(package
  (name "goblins-playground")
  (version "0.0.0-git")
  (source (local-file (dirname (current-filename))
                      #:recursive? #t
                      #:select? keep-file?))
  (build-system gnu-build-system)
  (native-inputs
   (list autoconf automake pkg-config texinfo))
  (inputs (list guile-next))
  (propagated-inputs
   (list guile-goblins guile-hoot*))
  (synopsis "A horrible goblin has stolen your keyboard! This is the result.")
  (description
   "[wretched goblin noises. disgusting and disreputable. you envy its abandon.]")
  (home-page "https://garbados.github.io/goblins-playground/")
  (license license:asl2.0))
